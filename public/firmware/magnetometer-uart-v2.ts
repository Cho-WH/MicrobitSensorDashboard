// Sensor Lab protocol v2. Preparation status never occupies a measurement row.
let connected = false
let phase = "idle"
let generation = 0

function report (state = "") {
    bluetooth.uartWriteLine("@mag,2," + state)
}

bluetooth.onBluetoothConnected(function () {
    connected = true
    phase = "idle"
    generation += 1
    basic.clearScreen()
})

bluetooth.onBluetoothDisconnected(function () {
    connected = false
    phase = "idle"
    generation += 1
    // End an in-progress compass animation as well as the UART session.
    control.reset()
})

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine)).trim().toLowerCase()
    if (!connected) return
    if (command == "prepare") {
        if (phase == "calibrating") {
            report("calibrating")
            return
        }
        generation += 1
        phase = "choice"
        basic.clearScreen()
        report("choice")
    } else if (command == "calibrate" && phase == "choice") {
        phase = "calibrating"
        let attempt = generation
        report("calibrating")
        input.calibrateCompass()
        if (!connected || generation != attempt || phase != "calibrating") return
        basic.clearScreen()
        report("calibrated")
        phase = "streaming"
    } else if (command == "skip" && phase == "choice") {
        report("skipped")
        phase = "streaming"
    } else if (command == "stop") {
        generation += 1
        phase = "idle"
    }
})

input.setAccelerometerRange(AcceleratorRange.EightG)
basic.clearScreen()
bluetooth.startUartService()

basic.forever(function () {
    if (connected && phase == "streaming") {
        bluetooth.uartWriteLine(
            convertToText(input.magneticForce(Dimension.X)) + "," +
            convertToText(input.magneticForce(Dimension.Y)) + "," +
            convertToText(input.magneticForce(Dimension.Z)) + "," +
            convertToText(input.magneticForce(Dimension.Strength))
        )
        basic.pause(100)
    } else {
        basic.pause(50)
    }
})
