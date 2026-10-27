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
            convertToText(input.magneticForce(Dimension.X)) + "," +
            convertToText(input.magneticForce(Dimension.Y)) + "," +
            convertToText(input.magneticForce(Dimension.Z)) + "," +
            convertToText(input.magneticForce(Dimension.Strength))
        )
        basic.pause(DEFAULT_SAMPLE_INTERVAL_MS)
    } else {
        basic.pause(50)
    }
})
