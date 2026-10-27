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

// main.ts
let streaming = false
let connected = false
let command = ""
let commandVersion = 0

bluetooth.onBluetoothConnected(function () {
    connected = true
    streaming = false
    commandVersion += 1
    SensorDisplay.setMode("connected")
})

bluetooth.onBluetoothDisconnected(function () {
    connected = false
    streaming = false
    commandVersion += 1
    SensorDisplay.setMode("waiting")
})

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    command = command.trim().toLowerCase()
    commandVersion += 1
    let startRequest = commandVersion
    streaming = false
    SensorDisplay.setMode(connected ? "connected" : "waiting")

    if (connected && command == "start") {
        // The first call enables LED light sensing and returns a placeholder zero.
        // Keep the display enabled and blank; later zero readings are valid darkness.
        input.lightLevel()
        basic.pause(DEFAULT_SAMPLE_INTERVAL_MS)
        if (connected && commandVersion == startRequest) {
            streaming = true
            SensorDisplay.setMode("streaming")
        }
    }
})

basic.clearScreen()
bluetooth.startUartService()
SensorDisplay.start(false)

basic.forever(function () {
    if (connected && streaming) {
        sendSample()
        basic.pause(DEFAULT_SAMPLE_INTERVAL_MS)
    } else {
        basic.pause(50)
    }
})

function sendSample () {
    // Relative brightness from 0 to 255; this value is not illuminance in lux.
    bluetooth.uartWriteLine(convertToText(input.lightLevel()))
}
