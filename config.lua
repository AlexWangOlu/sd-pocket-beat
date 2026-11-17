-- Every value below is copied straight into addCustomApp (client.lua).
Config = {}

Config.Identifier  = 'pocket-beat'          -- unique app id, never shown to players
Config.Name        = 'Pocket Beat'          -- home screen + App Store display name
Config.Description = 'A 16-step drum machine in your pocket. Four synthesised kits, '
                  .. 'swing, tap tempo and instant patterns. No audio files, no server.'
Config.Developer   = 'Pocket Beat'
Config.DefaultApp  = false                  -- false = players install it from the App Store

-- Cosmetic App Store listing values.
Config.Size        = 180                    -- kB shown on the listing
Config.Price       = 0

-- Optional: a command that opens the app. Set to nil to disable.
Config.Command     = 'pocketbeat'
