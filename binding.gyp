{
  "targets": [{
    "target_name": "OSX",
    "sources": [ "src/error.cpp", "src/semaphore-sysv.cpp", "src/semaphore-posix.cpp", "src/flock.cpp", "src/OSX.cpp" ],
    "include_dirs": ["node_modules/node-addon-api", "src-vendor/errnoname", "/usr/include"],
    "cflags_cc": ["-fexceptions", "-frtti", "-std=c++17" ],
    "conditions": [
      ["OS=='mac'", {
        "CXX":"/usr/bin/clang++",
        "LINK": "/usr/bin/clang++",
        "xcode_settings": {
          "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
          "GCC_ENABLE_CPP_RTTI": "YES",
          "CLANG_CXX_LIBRARY": "libc++",
          "MACOSX_DEPLOYMENT_TARGET": "14.4.1",
          "CLANG_CXX_LANGUAGE_STANDARD": "c++17"
        }
      }]
    ]
  }]
}
