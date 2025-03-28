
{ pkgs }: {
    deps = [
      pkgs.zlib
      pkgs.libxcrypt
      pkgs.libwebp
      pkgs.libtiff
      pkgs.libjpeg
      pkgs.libimagequant
      pkgs.lcms2
      pkgs.tk
      pkgs.tcl
      pkgs.qhull
      pkgs.pkg-config
      pkgs.gobject-introspection
      pkgs.ghostscript
      pkgs.ffmpeg-full
      pkgs.xcbuild
      pkgs.swig
      pkgs.openjpeg
      pkgs.mupdf
      pkgs.libjpeg_turbo
      pkgs.jbig2dec
      pkgs.harfbuzz
      pkgs.gumbo
      pkgs.freetype
      pkgs.glibcLocales
      pkgs.bash
        pkgs.nodejs_20
        pkgs.python3
        pkgs.glib
        pkgs.nss
        pkgs.nspr
        pkgs.dbus
        pkgs.atk
        pkgs.gtk3
        pkgs.cups
        pkgs.pango
        pkgs.cairo
        pkgs.alsa-lib
        pkgs.at-spi2-atk
        pkgs.xorg.libX11
        pkgs.xorg.libXcomposite
        pkgs.xorg.libXdamage
        pkgs.xorg.libXext
        pkgs.xorg.libXfixes
        pkgs.xorg.libXrandr
        pkgs.mesa
        pkgs.xorg.libxcb  # Added XCB library
        pkgs.dbus  # Added DBus library
    ];
}
