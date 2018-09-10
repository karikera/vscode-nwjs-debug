# NWjs README

Forked from `Debugger for Chrome`

English is not my mother tongue; please excuse any errors on my part.

## Install

Need to install when first run

You can open `command palette` with `F1` or `Ctrl + Shift + P`

Type `nwjs` to `command palette`

![Install command](images/install.png)

Select version, It takes a little while to open.

![Select version](images/selver.png)

It will start the installation at `UserDir/.nwjs/version-names-nwjs`.
Wait install.

![Installing](images/installing.png)

Launch NWjs

![run](images/run.png)

Shortcut is `F5`

## Use with multiple version

You can set version in `launch.json`. Use latest version by default

![launchver](images/launchver.png)

You can set version in `nwjs.publish.json` also.

![publishver](images/publishver.png)

## Commands
* `NWjs Install` : Download NWjs and install
* `NWjs Remove` : Remove NWjs
* `NWjs Publish` : Generate `publish` directory and copy NWjs for publish
* `NWjs Compile` : Compile javascript with `nwjc`

## Issues

Debugger will reload the page after attached. This work will run script twice. If you want not to that, Please set `reloadAfterAttached` to `false` in `launch.json`.

This extension use 9223 por.! If you want to change port, please set `port` field in `launch.json`.