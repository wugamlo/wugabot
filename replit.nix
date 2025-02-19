
{ pkgs }: {
    deps = [
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
        pkgs.xorg.libxcb
    ];
}
