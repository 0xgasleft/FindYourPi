{
  "targets": [
    {
      "target_name": "gmp_native",
      "sources": ["src/addon.cc"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<!(node -p \"(process.env.VCPKG_ROOT || 'C:/Users/deven/vcpkg') + '/installed/x64-windows/include'\")"
      ],
      "defines": ["NODE_ADDON_API_CPP_EXCEPTIONS"],
      "cflags_cc": ["-fexceptions"],
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 }
      },
      "conditions": [
        [
          "OS=='win'",
          {
            "libraries": ["<!(node -p \"(process.env.VCPKG_ROOT || 'C:/Users/deven/vcpkg') + '/installed/x64-windows/lib/gmp.lib'\")"],
            "copies": [
              {
                "destination": "<(PRODUCT_DIR)",
                "files": ["<!(node -p \"(process.env.VCPKG_ROOT || 'C:/Users/deven/vcpkg') + '/installed/x64-windows/bin/gmp-10.dll'\")"]
              }
            ]
          },
          {
            "libraries": ["-lgmp"]
          }
        ]
      ]
    }
  ]
}
