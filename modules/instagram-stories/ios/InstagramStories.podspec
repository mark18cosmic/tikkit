Pod::Spec.new do |s|
  s.name           = 'InstagramStories'
  s.version        = '1.0.0'
  s.summary        = 'Share an image straight to Instagram Stories'
  s.description    = 'Opens the Instagram Story composer with an image, without the system share sheet.'
  s.author         = ''
  s.homepage       = 'https://eventspace.mv'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
