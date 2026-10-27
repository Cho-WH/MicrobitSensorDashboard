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
