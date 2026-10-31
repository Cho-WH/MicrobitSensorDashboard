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
// Uses the released magnetometer preparation protocol; keep its pinned V1 source unchanged.
// Sensor Lab protocol v2. Preparation status never occupies a measurement row.
let connected = false
let phase = "idle"
// Volatile evidence from this boot only, independent of persisted compass offsets.
let calibrationComplete = false
let generation = 0

function report (state = "") {
    bluetooth.uartWriteLine("@mag,2," + state)
}

bluetooth.onBluetoothConnected(function () {
    connected = true
    generation += 1
    if (phase != "calibrating") {
        phase = "idle"
        SensorDisplay.setMode("connected")
    }
})

bluetooth.onBluetoothDisconnected(function () {
    connected = false
    generation += 1
    // Calibration belongs to the board, not to a Bluetooth connection.
    if (phase != "calibrating") {
        phase = "idle"
        SensorDisplay.setMode("waiting")
    }
})

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine)).trim().toLowerCase()
    if (!connected) return
    if (command == "prepare") {
        if (phase == "calibrating") return
        if (calibrationComplete) {
            report("calibrated")
            phase = "streaming"
            SensorDisplay.setMode("streaming")
        } else {
            phase = "choice"
            SensorDisplay.setMode("connected")
            report("choice")
        }
    } else if (command == "calibrate" && phase == "choice") {
        phase = "calibrating"
        SensorDisplay.setMode("calibrating")
        let attempt = generation
        report("calibrating")
        input.calibrateCompass()
        calibrationComplete = true
        SensorDisplay.setMode(connected ? "connected" : "waiting")
        phase = "idle"
        // A later connection asks for the retained completion through prepare.
        if (connected && generation == attempt) {
            report("calibrated")
            phase = "streaming"
            SensorDisplay.setMode("streaming")
        }
    } else if (command == "skip" && phase == "choice") {
        report("skipped")
        phase = "streaming"
        SensorDisplay.setMode("streaming")
    } else if (command == "stop") {
        generation += 1
        // Stop transmission without pretending to cancel the native compass routine.
        if (phase != "calibrating") {
            phase = "idle"
            SensorDisplay.setMode("connected")
        }
    }
})

input.setAccelerometerRange(AcceleratorRange.EightG)
basic.clearScreen()
bluetooth.startUartService()
SensorDisplay.start(true)

basic.forever(function () {
    if (connected && phase == "streaming") {
        bluetooth.uartWriteLine(
            convertToText(input.acceleration(Dimension.X)) + "," +
            convertToText(input.acceleration(Dimension.Y)) + "," +
            convertToText(input.acceleration(Dimension.Z)) + "," +
            convertToText(input.acceleration(Dimension.Strength)) + "," +
            convertToText(input.magneticForce(Dimension.Strength))
        )
        basic.pause(DEFAULT_SAMPLE_INTERVAL_MS)
    } else {
        basic.pause(50)
    }
})
