fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'sd-pocket-beat'
author 'Pocket Beat'
version '1.0.0'
description 'A pocket drum machine for sd-phone: 16-step sequencer, four synthesised kits, no audio files.'

shared_script 'config.lua'
client_script 'client.lua'

files {
    'ui/**/*'
}

-- ui_page does two jobs: client.lua reads it (GetResourceMetadata) to build the `ui`
-- field for addCustomApp, and FiveM renders it as this resource's own fullscreen NUI
-- layer. The page keeps <body> hidden and transparent so that layer never paints over
-- the game; the phone reveals it when the app is opened inside the app frame.
ui_page 'ui/index.html'
