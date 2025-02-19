
{ pkgs }: {
    deps = [
        pkgs.nodejs_20
        pkgs.python3
        pkgs.glib
        pkgs.nss
        pkgs.nspr
        pkgs.dbus
    ];
}
