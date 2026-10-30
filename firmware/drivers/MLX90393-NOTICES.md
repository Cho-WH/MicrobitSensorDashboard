# MLX90393 driver references

The local restricted driver is written against Melexis MLX90393 datasheet revision 012 (2025-11-18), commands and tables 12/17/19/21:
https://media.melexis.com/-/media/files/documents/datasheets/mlx90393-datasheet-melexis.pdf

Design references inspected (not bundled dependencies or copied block extensions):
- Daniel Gallichan's MakeCode extension, commit fe1299f88e42a83e4757b6c860e710b2f4bf46c4: https://github.com/dangallichan/microbit-extension-melexis90393/tree/fe1299f88e42a83e4757b6c860e710b2f4bf46c4
- Adafruit board guide: https://learn.adafruit.com/mlx90393-wide-range-3-axis-magnetometer?view=all

The local implementation checks I2C write results, response lengths/status, register readback and volatile settings; supports both Adafruit address families; exposes only two presets. It does not import the extension's calibration, blocks or source. No third-party library is added to the firmware runtime.
