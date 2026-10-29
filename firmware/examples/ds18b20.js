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
