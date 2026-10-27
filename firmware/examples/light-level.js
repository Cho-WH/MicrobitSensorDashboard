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
