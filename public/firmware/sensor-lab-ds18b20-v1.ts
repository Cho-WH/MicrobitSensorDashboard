// sensor-display.ts
// Shared by the registered sensor programs. No measurement or Bluetooth ownership.
// Only the display fiber waits. State changes cancel scrolling immediately.
const DEFAULT_SAMPLE_INTERVAL_MS = 100

namespace SensorDisplay {
    let mode = "connected"
    let startedAt = 0
    let lastFrame = -1
    let waveEnabled = true
    let deviceName = ""
    let generation = 0
    const identity = [27, 21, 14, 21, 27] // ##.## / #.#.# / .###. / #.#.# / ##.##
    const wave = [0, 8, 21, 2, 0] // ..... / .#... / #.#.# / ...#. / .....
    const waveOffsets = [0, -1, 0, 1]

    export function setMode(next: string) {
        if (mode == next) return
        mode = next
        startedAt = input.runningTime()
        lastFrame = -1
        generation += 1
        led.stopAnimation()
        basic.clearScreen()
    }

    export function start(showWave: boolean) {
        waveEnabled = showWave
        deviceName = control.deviceName()
        setMode("waiting")
        basic.forever(function () {
            update()
            basic.pause(40)
        })
    }

    // The program calls start only once; this loop never owns sensor state.
    export function update() {
        if (mode == "connected" || mode == "calibrating") return
        if (mode == "streaming" && !waveEnabled) return
        const elapsed = input.runningTime() - startedAt
        if (mode == "streaming") {
            const frame = Math.floor(elapsed / 300) % 4
            if (frame == lastFrame) return
            lastFrame = frame
            paint(wave, waveOffsets[frame])
            return
        }

        // Native scrolling keeps the runtime font. A state change cancels it;
        // the generation check prevents the resumed fiber from repainting.
        const attempt = generation
        paint(identity, 0)
        basic.pause(1000)
        if (generation != attempt) return
        basic.clearScreen()
        basic.pause(200)
        if (generation != attempt) return
        basic.showString(deviceName, 150)
        if (generation != attempt) return
        basic.clearScreen()
        basic.pause(400)
    }

    function paint(rows: number[], offset: number) {
        for (let y = 0; y < 5; y++) {
            const sourceY = y - offset
            const row = sourceY >= 0 && sourceY < 5 ? rows[sourceY] : 0
            for (let x = 0; x < 5; x++) {
                if (row & (1 << (4 - x))) led.plot(x, y)
                else led.unplot(x, y)
            }
        }
    }
}

// ds18b20-driver.ts
/*
 * MIT License
 * Copyright (c) 2018 ELECFREAKS
 * Copyright (c) 2021 Bill Siever
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// DS18B20, one externally powered probe per pin (3V / GND / DQ).
// Adapted from ELECFREAKS/Tinkertanker and Bill Siever; MIT notices and pinned
// source hashes: firmware/drivers/DS18B20-NOTICES.md. No native extension required.
// GPIO call overhead and BLE interrupts affect the 1-Wire timing: validate on V2
// hardware before publishing. CRC is an error check, not proof of timing margin.
const DS18B20_CONVERSION_MS = 760

function ds18b20Reset(pin: DigitalPin) {
    pins.setPull(pin, PinPullMode.PullUp)
    // Refuse a bus held low before actively driving it.
    if (pins.digitalReadPin(pin) == 0) return false
    pins.digitalWritePin(pin, 0)
    control.waitMicros(500)
    pins.digitalWritePin(pin, 1)
    pins.digitalReadPin(pin) // Release immediately; do not drive against presence.
    control.waitMicros(65)
    let present = pins.digitalReadPin(pin) == 0
    control.waitMicros(435)
    return pins.digitalReadPin(pin) == 1 && present
}

function ds18b20WriteByte(pin: DigitalPin, value: number) {
    for (let bit = 0; bit < 8; bit++) {
        pins.digitalWritePin(pin, 0)
        if ((value & 1) == 0) control.waitMicros(60)
        pins.digitalWritePin(pin, 1)
        pins.digitalReadPin(pin)
        // GPIO calls provide the short write-one low pulse; no scheduler yield
        // inside a slot. The explicit recovery also accommodates the weak pull-up.
        control.waitMicros((value & 1) == 0 ? 10 : 70)
        value = value >> 1
    }
}

function ds18b20ReadBit(pin: DigitalPin) {
    pins.digitalWritePin(pin, 0)
    pins.digitalWritePin(pin, 1)
    // As in the JavaLab driver, the first read switches to input and samples.
    let value = pins.digitalReadPin(pin)
    control.waitMicros(70)
    return value
}

function ds18b20ReadByte(pin: DigitalPin) {
    let value = 0
    for (let bit = 0; bit < 8; bit++) value = value | (ds18b20ReadBit(pin) << bit)
    return value
}

// Dallas/Maxim CRC-8, reflected polynomial 0x8C, initial value zero.
function ds18b20Crc(bytes: number[]) {
    let crc = 0
    for (let index = 0; index < bytes.length; index++) {
        let value = bytes[index]
        for (let bit = 0; bit < 8; bit++) {
            let mix = (crc ^ value) & 1
            crc = crc >> 1
            if (mix != 0) crc = crc ^ 0x8C
            value = value >> 1
        }
    }
    return crc
}

// Empty means failure. Never substitute the last temperature or a numeric zero.
function ds18b20DecodeScratchpad(bytes: number[]) {
    let result: number[] = []
    if (bytes.length != 9 || ds18b20Crc(bytes) != 0) return result
    // Volatile markers written before EVERY conversion. Detect an unaccepted
    // configuration or power reset (including the CRC-valid power-up 85 C value).
    // No EEPROM writes. The markers also reject an all-zero stuck-bus CRC.
    if (bytes[2] != 0xFF || bytes[3] != 0x80 || bytes[4] != 0x7F) return result
    let raw = bytes[0] | (bytes[1] << 8)
    if (raw >= 32768) raw -= 65536
    let celsius = raw / 16
    if (celsius < -55 || celsius > 125) return result
    result.push(celsius)
    return result
}

function ds18b20BeginConversion(pin: DigitalPin) {
    if (!ds18b20Reset(pin)) return false
    ds18b20WriteByte(pin, 0xCC) // Skip ROM: exactly one probe on this pin.
    ds18b20WriteByte(pin, 0x4E) // Write volatile scratchpad only.
    ds18b20WriteByte(pin, 0xFF)
    ds18b20WriteByte(pin, 0x80)
    ds18b20WriteByte(pin, 0x7F) // 12-bit; maximum conversion time 750 ms.
    if (!ds18b20Reset(pin)) return false
    ds18b20WriteByte(pin, 0xCC)
    ds18b20WriteByte(pin, 0x44)
    // In externally powered mode the sensor returns zero while converting.
    // Reject a command that was not accepted rather than reading an old value.
    return ds18b20ReadBit(pin) == 0
}

// Caller must wait DS18B20_CONVERSION_MS and revalidate the connection/request.
function ds18b20FinishConversion(pin: DigitalPin) {
    let invalid: number[] = []
    if (ds18b20ReadBit(pin) != 1 || !ds18b20Reset(pin)) return invalid
    ds18b20WriteByte(pin, 0xCC)
    ds18b20WriteByte(pin, 0xBE)
    let bytes: number[] = []
    for (let index = 0; index < 9; index++) bytes.push(ds18b20ReadByte(pin))
    return ds18b20DecodeScratchpad(bytes)
}

// main.ts
// One or two externally powered DS18B20 probes: one per P1/P2, shared 3V/GND.
let streaming = false
let connected = false
let request = 0
let command = ""
const DS18B20_PIN_1 = DigitalPin.P1
const DS18B20_PIN_2 = DigitalPin.P2
const DS18B20_SAMPLE_INTERVAL_MS = 1000

bluetooth.onBluetoothConnected(function () {
    connected = true
    streaming = false
    request += 1
    SensorDisplay.setMode("connected")
})

bluetooth.onBluetoothDisconnected(function () {
    connected = false
    streaming = false
    request += 1
    SensorDisplay.setMode("waiting")
})

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine)).trim().toLowerCase()
    streaming = connected && command == "start"
    request += 1
    SensorDisplay.setMode(streaming ? "streaming" : connected ? "connected" : "waiting")
})

basic.clearScreen()
bluetooth.startUartService()
SensorDisplay.start(true)
basic.forever(function () {
    if (connected && streaming) {
        let currentRequest = request
        let startedAt = input.runningTime()
        let converting1 = ds18b20BeginConversion(DS18B20_PIN_1)
        let converting2 = ds18b20BeginConversion(DS18B20_PIN_2)
        // Yield during conversion so BLE, stop, disconnect and the display work.
        if (converting1 || converting2) basic.pause(DS18B20_CONVERSION_MS)
        if (connected && streaming && currentRequest == request) {
            let sample1 = converting1 ? ds18b20FinishConversion(DS18B20_PIN_1) : []
            let sample2 = converting2 ? ds18b20FinishConversion(DS18B20_PIN_2) : []
            // Fixed P1,P2 order; an absent/failed probe is an empty field.
            // Both invalid: no numeric row, so the app detects stopped reception.
            if (sample1.length == 1 || sample2.length == 1) {
                bluetooth.uartWriteLine((sample1.length == 1 ? convertToText(sample1[0]) : "") + "," +
                    (sample2.length == 1 ? convertToText(sample2[0]) : ""))
            }
            let remaining = DS18B20_SAMPLE_INTERVAL_MS - (input.runningTime() - startedAt)
            if (remaining > 0) basic.pause(remaining)
        }
    } else {
        basic.pause(50)
    }
})
