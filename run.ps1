$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and $_.IPAddress -ne '127.0.0.1' }).IPAddress | Select-Object -First 1

Write-Host ""
Write-Host "========================================"
Write-Host "  MỜI THUÊ TOOL - SERVER"
Write-Host "========================================"
Write-Host ""
Write-Host "  Điện thoại cùng WiFi mở trình duyệt:"
Write-Host "  http://$ip`:3003"
Write-Host ""
Write-Host "========================================"
Write-Host ""

node server.js
Read-Host "Press Enter to exit"
