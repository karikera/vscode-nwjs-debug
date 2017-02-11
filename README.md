# NWjs README

Forked from `Debugger for Chrome`

NWjs version: `v0.14.7-sdk`

English is not my mother tongue; please excuse any errors on my part.

## Install

Need to install when first run

![Install command](img/install.png)

Select need version

![Select version](img/selver.png)

Wait install

![Installing](img/installing.png)

Launch NWjs

![run](img/run.png)

Shortcut is `F5`

## Use with multiple version

Set version in launch.json. Use latest version by default

![launchver](img/launchver.png)

Set version in nwjs.publish.json. Use latest version by default

![publishver](img/publishver.png)

## Commands
* `NWjs Install` : Download NWjs and install
* `NWjs Remove` : Remove NWjs
* `NWjs Publish` : Generate `publish` directory and copy NWjs for publish
* `NWjs Compile` : Compile javascript with `nwjc`

## Issues

Chrome debugger will attach little later after launch,  
If you want to debug a script that run immediately, You can use `Restart Debugger`(Ctrl+Shift+F5, It will just reload page)
