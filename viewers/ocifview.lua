local args = {...}
local component = require("component")
local event = require("event")
local gpu = component.gpu
local invoke = component.invoke
local gpuAddress = gpu.address
local appliedPalette = {}

if not gpuAddress then
  for address in component.list("gpu") do
    gpuAddress = address
    break
  end
end

local palette = {}

local function fail(message)
  error("ERROR: " .. message, 0)
end

local function readFile(filename)
  local file, reason = io.open(filename, "rb")
  if not file then
    fail(reason or ("Could not open " .. tostring(filename)))
  end
  local data = file:read("*a")
  file:close()
  return data
end

local function makeReader(data)
  local pos = 1
  local len = #data

  local function need(count)
    if pos + count - 1 > len then
      fail("Unexpected end of file")
    end
  end

  local function r8()
    need(1)
    local value = data:byte(pos)
    pos = pos + 1
    return value
  end

  local function r16()
    local hi = r8()
    return (hi << 8) | r8()
  end

  local function r32()
    local b1 = r8()
    local b2 = r8()
    local b3 = r8()
    return (b1 << 24) | (b2 << 16) | (b3 << 8) | r8()
  end

  local function rstr(count)
    need(count)
    local value = data:sub(pos, pos + count - 1)
    pos = pos + count
    return value
  end

  return r8, r16, r32, rstr
end

local function captureState()
  local state = {}
  state.width, state.height = gpu.getResolution()
  state.depth = gpu.getDepth()
  state.bg, state.bgPalette = gpu.getBackground()
  state.fg, state.fgPalette = gpu.getForeground()
  state.screen = gpu.getScreen()
  if state.screen then
    local ok, precise = pcall(invoke, state.screen, "isPrecise")
    if ok then
      state.precise = precise
    end
  end
  state.palette = {}
  for i = 0, 15 do
    local ok, color = pcall(gpu.getPaletteColor, i)
    if ok then
      state.palette[i] = color
    end
  end
  return state
end

local function restoreState(state)
  if state.screen and state.precise ~= nil then
    pcall(invoke, state.screen, "setPrecise", state.precise)
  end
  for i = 0, 15 do
    if state.palette[i] then
      pcall(gpu.setPaletteColor, i, state.palette[i])
    end
  end
  pcall(gpu.setDepth, state.depth)
  pcall(gpu.setResolution, state.width, state.height)
  pcall(gpu.setBackground, state.bg, state.bgPalette)
  pcall(gpu.setForeground, state.fg, state.fgPalette)
  pcall(gpu.fill, 1, 1, state.width, state.height, " ")
  appliedPalette = {}
end

local compressedDataFlag = 1

local function readHeaderChunk(data)
  local r8 = makeReader(data)
  local flags = r8()
  local charWidth = r8()
  local charHeight = r8()

  if (flags & compressedDataFlag) ~= 0 then
    fail("Compressed OCIF DAT chunks are not supported by this viewer yet")
  end

  if charWidth ~= 2 or charHeight ~= 4 then
    fail("Unsupported character size: " .. charWidth .. "x" .. charHeight)
  end

  local depth = r8()
  if depth ~= 4 and depth ~= 8 then
    fail("Unsupported bit depth: " .. depth)
  end

  local width = r8()
  local height = r8()
  return {
    width = width,
    height = height,
    depth = depth
  }
end

local function readPaletteChunk(data)
  local r8, r16 = makeReader(data)
  local paletteColors = r16()

  if paletteColors < 16 or paletteColors > 256 then
    fail("Unsupported palette entry amount: " .. paletteColors)
  end

  palette = {}
  for i = 0, paletteColors - 1 do
    local r = r8()
    local g = r8()
    local b = r8()
    palette[i] = (r << 16) | (g << 8) | b
  end
end

local function readImage(data)
  local r8, _, r32, rstr = makeReader(data)

  if rstr(4) ~= "OCIF" then
    fail("Invalid OCIF header")
  end

  local version = r8()
  if version ~= 1 then
    fail("Unsupported OCIF version: " .. version)
  end

  local image = nil
  local hasPalette = false
  local dat = {}

  while true do
    local name = rstr(3)
    local length = r32()
    local payload = rstr(length)
    local checksum = r32()

    if name == "HDR" then
      image = readHeaderChunk(payload)
    elseif name == "PAL" then
      readPaletteChunk(payload)
      hasPalette = true
    elseif name == "DAT" then
      dat[#dat + 1] = payload
    elseif name == "END" then
      break
    end
  end

  if not image then
    fail("Missing OCIF HDR chunk")
  end

  if not hasPalette then
    fail("Missing OCIF PAL chunk")
  end

  if #dat < 1 then
    fail("Missing OCIF DAT chunk")
  end

  image.data = table.concat(dat)
  return image
end

local function applyPalette()
  for i = 0, 15 do
    if appliedPalette[i] ~= palette[i] then
      pcall(invoke, gpuAddress, "setPaletteColor", i, palette[i])
      appliedPalette[i] = palette[i]
    end
  end
end

local function enablePreciseMode()
  local screenAddress = gpu.getScreen()
  if screenAddress then
    pcall(invoke, screenAddress, "setPrecise", true)
  end
end

local function setDisplayMode(image)
  local maxDepth = gpu.maxDepth()
  if image.depth > maxDepth then
    fail("Image requires depth " .. image.depth .. ", but this GPU/screen supports " .. maxDepth)
  end

  if gpu.getDepth() ~= image.depth then
    gpu.setDepth(image.depth)
    appliedPalette = {}
  end

  local maxWidth, maxHeight = gpu.maxResolution()
  if image.width > maxWidth or image.height > maxHeight then
    fail("Image too large: " .. image.width .. "x" .. image.height .. " (max: " .. maxWidth .. "x" .. maxHeight .. ")")
  end

  local width, height = gpu.getResolution()
  if width ~= maxWidth or height ~= maxHeight then
    gpu.setResolution(maxWidth, maxHeight)
    appliedPalette = {}
  end

  return maxWidth, maxHeight
end

local function isQuitKey(char, key)
  return char == 113 or char == 81 or key == 0x10 or key == 0x01
end

local function clearMargins(imageWidth, imageHeight, offx, offy, screenWidth, screenHeight)
  local gpuInvoke = invoke
  local address = gpuAddress

  gpuInvoke(address, "setBackground", 0x000000)
  gpuInvoke(address, "setForeground", 0xFFFFFF)

  if offy > 0 then
    gpuInvoke(address, "fill", 1, 1, screenWidth, offy, " ")
  end

  local bottom = screenHeight - imageHeight - offy
  if bottom > 0 then
    gpuInvoke(address, "fill", 1, offy + imageHeight + 1, screenWidth, bottom, " ")
  end

  if offx > 0 then
    gpuInvoke(address, "fill", 1, offy + 1, offx, imageHeight, " ")
  end

  local right = screenWidth - imageWidth - offx
  if right > 0 then
    gpuInvoke(address, "fill", offx + imageWidth + 1, offy + 1, right, imageHeight, " ")
  end
end

local function drawBuckets(r8, r16, rstr, offx, offy)
  local gpuInvoke = invoke
  local address = gpuAddress
  local colors = palette
  local bucketCount = r16()
  local currentBgIndex = -1
  local currentFgIndex = -1

  for _ = 1, bucketCount do
    local bgIndex = r8()
    local fgIndex = r8()
    local runCount = r16()

    if currentBgIndex ~= bgIndex then
      if bgIndex < 16 then
        gpuInvoke(address, "setBackground", bgIndex, true)
      else
        gpuInvoke(address, "setBackground", colors[bgIndex], false)
      end
      currentBgIndex = bgIndex
    end
    if currentFgIndex ~= fgIndex then
      if fgIndex < 16 then
        gpuInvoke(address, "setForeground", fgIndex, true)
      else
        gpuInvoke(address, "setForeground", colors[fgIndex], false)
      end
      currentFgIndex = fgIndex
    end

    for _ = 1, runCount do
      local x = r8()
      local y = r8()
      local cells = r8()
      local text = rstr(cells * 3)

      if cells > 0 then
        gpuInvoke(address, "set", offx + x + 1, offy + y + 1, text)
      end
    end
  end
end

local function view(filename)
  local image = readImage(readFile(filename))
  local r8, r16, _, rstr = makeReader(image.data)

  enablePreciseMode()
  local maxWidth, maxHeight = setDisplayMode(image)

  local offx = math.floor((maxWidth - image.width) / 2)
  local offy = math.floor((maxHeight - image.height) / 2)

  applyPalette()
  clearMargins(image.width, image.height, offx, offy, maxWidth, maxHeight)

  drawBuckets(r8, r16, rstr, offx, offy)
end

local viewer = {
  captureState = captureState,
  restoreState = restoreState,
  view = view
}

if args[1] == "ocifview" then
  return viewer
end

if not args[1] then
  print("Usage: ocifview <file.ocif>")
  os.exit(1)
end

local state = captureState()
local ok, message = xpcall(function()
  view(args[1])
  while true do
    local _, _, char, key = event.pull("key_down")
    if isQuitKey(char, key) then
      break
    end
  end
end, debug.traceback)

restoreState(state)
if not ok then
  print(message)
  os.exit(1)
end
