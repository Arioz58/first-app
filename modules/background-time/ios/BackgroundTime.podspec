Pod::Spec.new do |s|
  s.name           = 'BackgroundTime'
  s.version        = '1.0.0'
  s.summary        = "Temps d'exécution en arrière-plan (beginBackgroundTask)"
  s.description    = "Module local : demande à iOS de ne pas suspendre l'app pendant un travail court."
  s.author         = 'Nexa'
  s.homepage       = 'https://nexa.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
