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

// bmp280-driver.ts
// BMP280 temperature/pressure driver for the common core + Bluetooth runtime.
// Equations: Bosch BMP280 datasheet BST-BMP280-DS001-26, sections 3.9 and 8.1.
// https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf
// Uses one coherent six-byte sample; no humidity measurement or top-level I2C access.
let bmp280Address = 0
let bmp280Calibration: number[] = []

function bmp280ReadRegisters(register: number, length: number) {
    pins.i2cWriteNumber(bmp280Address, register, NumberFormat.UInt8BE, true)
    return pins.i2cReadBuffer(bmp280Address, length)
}

function bmp280WriteRegister(register: number, value: number) {
    let bytes = pins.createBuffer(2)
    bytes[0] = register
    bytes[1] = value
    pins.i2cWriteBuffer(bmp280Address, bytes)
}

function bmp280Initialize() {
    bmp280Address = 0
    bmp280Calibration = []
    // The current activity uses temperature/pressure only, also available on BME280.
    for (let address = 0x76; address <= 0x77; address++) {
        bmp280Address = address
        let identity = bmp280ReadRegisters(0xD0, 1)[0]
        if (identity == 0x58 || identity == 0x60) break
        bmp280Address = 0
    }
    if (bmp280Address == 0) return false
    bmp280WriteRegister(0xE0, 0xB6)
    basic.pause(2)
    let ready = false
    for (let attempt = 0; attempt < 10; attempt++) {
        if ((bmp280ReadRegisters(0xF3, 1)[0] & 1) == 0) {
            ready = true
            break
        }
        basic.pause(2)
    }
    if (!ready) return false
    let bytes = bmp280ReadRegisters(0x88, 24)
    if (bytes.length != 24) return false
    let coefficients: number[] = []
    for (let index = 0; index < 12; index++) {
        let value = bytes[index * 2] + bytes[index * 2 + 1] * 256
        // T1 and P1 are unsigned; every other calibration word is signed.
        if (index != 0 && index != 3 && value >= 32768) value -= 65536
        coefficients.push(value)
    }
    if (coefficients[0] == 0 || coefficients[0] == 65535 || coefficients[3] == 0 || coefficients[3] == 65535) return false
    bmp280Calibration = coefficients
    // Preserve the previous sampling settings: filter 8, T x1, P x4, normal mode.
    bmp280WriteRegister(0xF5, 0x0C)
    bmp280WriteRegister(0xF4, 0x2F)
    basic.pause(15)
    return true
}

// Returns [degrees Celsius, pascals]. Empty means invalid, never a fabricated zero.
function bmp280Compensate(rawTemperature: number, rawPressure: number, calibration: number[]) {
    let result: number[] = []
    if (calibration.length != 12 || calibration[3] == 0 || rawTemperature < 0 || rawTemperature > 1048575
        || rawPressure < 0 || rawPressure > 1048575 || rawTemperature == 0x80000 || rawPressure == 0x80000) return result
    let temperatureDelta = rawTemperature / 16384 - calibration[0] / 1024
    let temperatureCurve = rawTemperature / 131072 - calibration[0] / 8192
    let fine = temperatureDelta * calibration[1] + temperatureCurve * temperatureCurve * calibration[2]
    let temperatureC = fine / 5120
    // Bosch's double reference casts t_fine to signed int32, truncating toward zero.
    let fineInteger = fine < 0 ? Math.ceil(fine) : Math.floor(fine)
    let pressureBase = fineInteger / 2 - 64000
    let pressureOffset = pressureBase * pressureBase * calibration[8] / 32768
        + pressureBase * calibration[7] * 2
    pressureOffset = pressureOffset / 4 + calibration[6] * 65536
    let pressureScale = (calibration[5] * pressureBase * pressureBase / 524288 + calibration[4] * pressureBase) / 524288
    pressureScale = (1 + pressureScale / 32768) * calibration[3]
    if (pressureScale == 0) return result
    let pressurePa = (1048576 - rawPressure - pressureOffset / 4096) * 6250 / pressureScale
    pressurePa += (calibration[11] * pressurePa * pressurePa / 2147483648
        + pressurePa * calibration[10] / 32768 + calibration[9]) / 16
    result.push(temperatureC)
    result.push(pressurePa)
    return result
}

function bmp280ReadSample() {
    let bytes = bmp280ReadRegisters(0xF7, 6)
    if (bytes.length != 6) return bmp280Compensate(-1, -1, bmp280Calibration)
    let rawPressure = bytes[0] * 4096 + bytes[1] * 16 + (bytes[2] >> 4)
    let rawTemperature = bytes[3] * 4096 + bytes[4] * 16 + (bytes[5] >> 4)
    return bmp280Compensate(rawTemperature, rawPressure, bmp280Calibration)
}

// main.ts
let streaming = false
let connected = false
let sensorReady = false
let request = 0
let command = ""

bluetooth.onBluetoothConnected(function () {
    connected = true
    streaming = false
    sensorReady = false
    request += 1
    SensorDisplay.setMode("connected")
})

bluetooth.onBluetoothDisconnected(function () {
    connected = false
    streaming = false
    sensorReady = false
    request += 1
    SensorDisplay.setMode("waiting")
})

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine)).trim().toLowerCase()
    streaming = connected && command == "bme"
    request += 1
    SensorDisplay.setMode(streaming ? "streaming" : connected ? "connected" : "waiting")
})

basic.clearScreen()
bluetooth.startUartService()
SensorDisplay.start(true)
basic.forever(function () {
    if (connected && streaming) {
        let currentRequest = request
        if (!sensorReady) {
            let initialized = bmp280Initialize()
            if (connected && streaming && currentRequest == request) sensorReady = initialized
        }
        if (connected && streaming && currentRequest == request) {
            let sample = sensorReady ? bmp280ReadSample() : [0]
            // Keep the legacy three-column wire format; humidity remains unsupported.
            if (sample.length == 2) {
                bluetooth.uartWriteLine(convertToText(sample[0]) + ",," + convertToText(sample[1] / 100))
            } else {
                bluetooth.uartWriteLine(",,")
                sensorReady = false
            }
        }
        basic.pause(DEFAULT_SAMPLE_INTERVAL_MS)
    } else {
        basic.pause(50)
    }
})
