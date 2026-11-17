-- sd-pocket-beat: the whole Lua side of the app.
--
-- What it does:
--   1. Waits until sd-phone has started, then registers the app.
--   2. Re-registers whenever sd-phone restarts (registrations live in the phone's
--      memory only, so a restart forgets them).
--   3. Adds /pocketbeat so staff can open it without hunting the home screen.
--
-- There is no server script and no database: the drum machine is a pure client-side
-- instrument, which is what makes it work on any framework.

-- Builds the value handed to addCustomApp as the `ui` field. A full http(s) URL (a
-- live dev server) passes through untouched; anything else becomes the resource-
-- relative form sd-phone rewrites into https://cfx-nui-<resource>/...
---@return string|nil
local function resolveUi()
    local resource = GetCurrentResourceName()
    local uiPage = GetResourceMetadata(resource, 'ui_page', 0)
    if not uiPage or uiPage == '' then return nil end
    if uiPage:find('^https?://') then
        return uiPage
    end
    return resource .. '/' .. uiPage
end

-- Registers (or re-registers) this resource's app with sd-phone. Safe to call more
-- than once; re-registering the same identifier just replaces the old entry.
local function register()
    local resource = GetCurrentResourceName()

    local ok, err = exports['sd-phone']:addCustomApp({
        identifier  = Config.Identifier,
        name        = Config.Name,
        description = Config.Description,
        developer   = Config.Developer,
        defaultApp  = Config.DefaultApp,
        ui          = resolveUi(),
        icon        = ('https://cfx-nui-%s/ui/icon.svg'):format(resource),
        images      = {
            ('https://cfx-nui-%s/ui/screenshot-1.png'):format(resource),
            ('https://cfx-nui-%s/ui/screenshot-2.png'):format(resource),
        },
        size        = Config.Size,
        price       = Config.Price,
        onOpen = function()
            print(('[%s] onOpen: player opened the drum machine'):format(Config.Identifier))
        end,
        onClose = function()
            print(('[%s] onClose: player closed the drum machine'):format(Config.Identifier))
        end,
    })

    if ok then
        print(('[%s] registered with sd-phone'):format(Config.Identifier))
    else
        print(('[%s] registration failed: %s'):format(Config.Identifier, err or 'unknown error'))
    end
end

-- Initial registration once sd-phone is up. The export can land a moment after the
-- resource reports "started", so wait one extra beat.
CreateThread(function()
    while GetResourceState('sd-phone') ~= 'started' do
        Wait(500)
    end
    Wait(1000)
    register()
end)

-- Re-register after a phone restart so the app comes back without rebooting this one.
AddEventHandler('onResourceStart', function(startedResource)
    if startedResource ~= 'sd-phone' then return end
    Wait(1000)
    register()
end)

-- Convenience command. Reads the version back from the manifest so the printout
-- never drifts from fxmanifest.lua.
if Config.Command then
    RegisterCommand(Config.Command, function()
        if GetResourceState('sd-phone') ~= 'started' then
            print(('[%s] sd-phone is not running'):format(Config.Identifier))
            return
        end
        exports['sd-phone']:openApp(Config.Identifier)
    end, false)
end

CreateThread(function()
    local version = GetResourceMetadata(GetCurrentResourceName(), 'version', 0)
    print(('[%s] v%s loaded — a drum machine with no server, no database and no audio files')
        :format(Config.Identifier, version or '?'))
end)
