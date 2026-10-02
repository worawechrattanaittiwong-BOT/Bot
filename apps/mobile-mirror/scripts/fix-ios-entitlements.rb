#!/usr/bin/env ruby
# Expo/apiRTC may add .entitlements files to Copy Bundle Resources as well as
# CODE_SIGN_ENTITLEMENTS. Xcode 16 rejects that as duplicate output tasks.
# Keep the entitlement file/reference and signing setting, but remove it from
# every PBXResourcesBuildPhase.

require "xcodeproj"

project_path = Dir[File.expand_path("../ios/*.xcodeproj", __dir__)].first
abort("iOS Xcode project not found") unless project_path

project = Xcodeproj::Project.open(project_path)
removed = 0

project.targets.each do |target|
  phase = target.resources_build_phase
  next unless phase

  phase.files.dup.each do |build_file|
    path = build_file.file_ref&.path.to_s
    next unless path.end_with?(".entitlements")

    build_file.remove_from_project
    removed += 1
  end
end

project.save
puts "Removed #{removed} entitlements resource entries; signing entitlements remain configured."
