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

// mlx90393-driver.ts
// MLX90393 rev012 (Melexis), tables 12, 17, 19, 21. See MLX90393-NOTICES.md.
// Restricted to two verified register recipes, no EEPROM writes or compass calibration.
let mlxAddress = 0
let mlxWide = false

function mlxExchange(bytes: number[], length: number) {
    if (pins.i2cWriteBuffer(mlxAddress, pins.createBufferFromArray(bytes)) != 0) return pins.createBuffer(0)
    return pins.i2cReadBuffer(mlxAddress, length)
}
function mlxStatus(bytes: Buffer, length: number) {
    return bytes.length == length && (bytes[0] & 0x14) == 0 && (length == 1 || (bytes[0] & 3) == (length - 3) / 2)
}
function mlxReadRegister(reg: number) {
    let b = mlxExchange([0x50, reg << 2], 3)
    return mlxStatus(b, 3) ? b[1] * 256 + b[2] : -1
}
function mlxUpdateRegister(reg: number, mask: number, value: number) {
    let old = mlxReadRegister(reg)
    if (old < 0) return false
    let next = (old & ~mask) | (value & mask)
    if (!mlxStatus(mlxExchange([0x60, next >> 8, next & 255, reg << 2], 1), 1)) return false
    return mlxReadRegister(reg) == next
}
function mlxInitialize(wide: boolean) {
    mlxAddress = 0
    // Current and original Adafruit QT addresses, including hardware address straps.
    let addresses = [0x18, 0x19, 0x1A, 0x1B, 0x0C, 0x0D, 0x0E, 0x0F]
    for (let i = 0; i < addresses.length; i++) {
        mlxAddress = addresses[i]
        if (!mlxStatus(mlxExchange([0x80], 1), 1)) continue
        basic.pause(5)
        // A write/readback challenge rejects absent buses returning all zeroes.
        if (!mlxUpdateRegister(0, 0x007F, wide ? 0x000C : 0x007C)) continue
        // Disable temperature compensation and external trigger; preserve other trim bits.
        if (!mlxUpdateRegister(1, 0x0600, 0)) continue
        if (!mlxUpdateRegister(2, 0x1FFF, (wide ? 0x02A0 : 0) | 0x001A)) continue
        mlxWide = wide
        return true
    }
    mlxAddress = 0
    return false
}
function mlxMeasure() {
    let empty: number[] = []
    // Recheck volatile settings: a sensor reset must not silently change scaling.
    if (mlxAddress == 0 || (mlxReadRegister(0) & 0x7F) != (mlxWide ? 0x0C : 0x7C)
        || (mlxReadRegister(1) & 0x0600) != 0
        || (mlxReadRegister(2) & 0x1FFF) != ((mlxWide ? 0x02A0 : 0) | 0x001A)) return empty
    let started = mlxExchange([0x3F], 1)
    if (!mlxStatus(started, 1) || (started[0] & 0x20) == 0) return empty
    basic.pause(62)
    let b = mlxExchange([0x4F], 9)
    if (!mlxStatus(b, 9)) return empty
    let result: number[] = []
    for (let axis = 0; axis < 3; axis++) {
        let raw = b.getNumber(NumberFormat.Int16BE, 3 + axis * 2)
        // Return raw ADC counts; app marks endpoint/saturation values invalid, preserving evidence.
        result.push(raw)
    }
    return result
}

// main.ts
let connected = false
let streaming = false
let request = 0
let configured = -1
let preset = "normal"
let token = "0"
bluetooth.onBluetoothConnected(function () {
    connected = true; streaming = false; request += 1
    SensorDisplay.setMode("connected")
})
bluetooth.onBluetoothDisconnected(function () {
    connected = false; streaming = false; request += 1
    SensorDisplay.setMode("waiting")
})
bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine)).trim().toLowerCase()
    if (!connected) return
    if (command == "prepare") {
        streaming = false; request += 1
        bluetooth.uartWriteLine("@mlx,1,ready")
    } else if (command == "stop") {
        streaming = false; request += 1
    } else {
        let parts = command.split(",")
        if (parts.length != 3 || parts[0] != "configure" || (parts[1] != "normal" && parts[1] != "wide")) return
        let id = parseInt(parts[2])
        if (id < 1 || id > 1000000 || convertToText(id) != parts[2]) return
        preset = parts[1]; token = parts[2]; request += 1; streaming = true
    }
    SensorDisplay.setMode("connected")
})
basic.clearScreen()
bluetooth.startUartService()
SensorDisplay.start(true)
basic.forever(function () {
    if (!connected || !streaming) { basic.pause(50); return }
    let current = request
    let currentPreset = preset
    let currentToken = token
    let startedAt = input.runningTime()
    if (configured != current) {
        let ok = mlxInitialize(currentPreset == "wide")
        if (!connected || !streaming || current != request) return
        if (!ok) {
            streaming = false
            bluetooth.uartWriteLine("@mlx,1,error," + currentToken)
            return
        }
        configured = current
        bluetooth.uartWriteLine("@mlx,1,applied," + currentPreset + "," + currentToken)
        SensorDisplay.setMode("streaming")
    }
    let values = mlxMeasure()
    if (!connected || !streaming || current != request) return
    if (values.length == 3) bluetooth.uartWriteLine("mlx,1," + currentPreset + "," + currentToken + "," + values.join(","))
    let remaining = 100 - (input.runningTime() - startedAt)
    if (remaining > 0) basic.pause(remaining)
})
