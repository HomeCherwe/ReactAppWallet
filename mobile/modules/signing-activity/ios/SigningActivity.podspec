Pod::Spec.new do |s|
  s.name           = 'SigningActivity'
  s.version        = '1.0.0'
  s.summary        = 'The signing live activity of MyWallet'
  s.description    = 'Starts, updates and ends the Lock Screen live activity shown while the 7-day signature runs out'
  s.license        = 'MIT'
  s.author         = 'MyWallet'
  s.homepage       = 'https://github.com/HomeCherwe/ReactAppWallet'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/HomeCherwe/ReactAppWallet.git' }

  s.dependency 'ExpoModulesCore'

  s.static_framework = true
  s.source_files = "**/*.{h,m,swift}"
end
