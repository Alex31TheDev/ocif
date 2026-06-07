local args = {...}
local component = require("component")
local event = require("event")
local filesystem = require("filesystem")
local shell = require("shell")
local viewer = require("ocifview")

local gpu = component.gpu

local function fail(message)
  error("ERROR: " .. message, 0)
end

local function usage()
  print("Usage: slideshow <folder> <delaySeconds>")
  os.exit(1)
end

local function naturalLess(a, b)
  local i = 1
  local j = 1

  a = a:lower()
  b = b:lower()

  while i <= #a and j <= #b do
    local aStart, aEnd = a:find("^%d+", i)
    local bStart, bEnd = b:find("^%d+", j)

    if aStart and bStart then
      local aNum = tonumber(a:sub(aStart, aEnd))
      local bNum = tonumber(b:sub(bStart, bEnd))

      if aNum ~= bNum then
        return aNum < bNum
      end

      i = aEnd + 1
      j = bEnd + 1
    else
      local aChar = a:sub(i, i)
      local bChar = b:sub(j, j)

      if aChar ~= bChar then
        return aChar < bChar
      end

      i = i + 1
      j = j + 1
    end
  end

  return #a < #b
end

local function sortedImages(folder)
  local iterator, reason = filesystem.list(folder)
  if not iterator then
    return nil, reason or ("Could not list " .. tostring(folder))
  end

  local files = {}
  for name in iterator do
    local filename = filesystem.concat(folder, name)
    if not filesystem.isDirectory(filename) and name:lower():match("%.ocif$") then
      files[#files + 1] = name
    end
  end

  table.sort(files, naturalLess)

  return files
end

local function imageFolder(folder)
  local candidates = {shell.resolve(folder)}

  if folder:sub(1, 1) ~= "/" then
    candidates[#candidates + 1] = filesystem.concat("/home", folder)
  end

  local lastReason = nil
  for i = 1, #candidates do
    local files, reason = sortedImages(candidates[i])
    if files and #files > 0 then
      return candidates[i], files
    end
    lastReason = reason
  end

  fail((lastReason or "No .ocif files found") .. ": " .. tostring(folder))
end

local function clearScreen()
  local w, h = gpu.getResolution()
  gpu.setBackground(0x000000)
  gpu.setForeground(0xFFFFFF)
  gpu.fill(1, 1, w, h, " ")
end

local function waitOrQuit(delay)
  local name, _, char, key = event.pull(delay, "key_down")
  return name == "key_down" and (char == 113 or char == 81 or key == 0x10 or key == 0x01)
end

local function run(folder, delay)
  local files
  folder, files = imageFolder(folder)

  while true do
    for i = 1, #files do
      -- clearScreen()
      viewer.view(filesystem.concat(folder, files[i]))
      if waitOrQuit(delay) then
        return
      end
    end
  end
end

if not args[1] or not args[2] then
  usage()
end

local delay = tonumber(args[2])
if not delay or delay < 0 then
  fail("delaySeconds must be a number >= 0")
end

local state = viewer.captureState()
local ok, message = xpcall(function()
  run(args[1], delay)
end, debug.traceback)

viewer.restoreState(state)
if not ok then
  print(message)
  os.exit(1)
end