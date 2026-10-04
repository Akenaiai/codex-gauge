!macro customInit
  ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $R0 != ""
    IfFileExists "$R0\resources\native\GaugeStarter.exe" 0 +2
      ExecWait '"$R0\resources\native\GaugeStarter.exe" --stop'
  ${EndIf}
!macroend

!macro customUnInit
  IfFileExists "$INSTDIR\resources\native\GaugeStarter.exe" 0 +2
    ExecWait '"$INSTDIR\resources\native\GaugeStarter.exe" --disable'
!macroend
