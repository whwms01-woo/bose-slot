# PowerShell copy script for BOSE slot machine assets using relative target paths
New-Item -ItemType Directory -Path ".\assets" -Force

Copy-Item "C:\Users\itdm_\.gemini\antigravity\brain\d0ab74b5-2eb5-4423-8b52-606fa7665ced\product_headphone_1779175478488.png" ".\assets\product_headphone.png" -Force
Copy-Item "C:\Users\itdm_\.gemini\antigravity\brain\d0ab74b5-2eb5-4423-8b52-606fa7665ced\product_earbud_1779175496064.png" ".\assets\product_earbud.png" -Force
Copy-Item "C:\Users\itdm_\.gemini\antigravity\brain\d0ab74b5-2eb5-4423-8b52-606fa7665ced\product_speaker_1779175514420.png" ".\assets\product_speaker.png" -Force
Copy-Item "C:\Users\itdm_\.gemini\antigravity\brain\d0ab74b5-2eb5-4423-8b52-606fa7665ced\bose_event_bg_1779175533638.png" ".\assets\bose_event_bg.png" -Force

Write-Host "BOSE 슬롯머신 이미지 복사 완료! 🎧🔊"
