# UIshades

A free, ad-free OKLCH shade generator. Visitors explore shades for a color and can assemble several colors into a palette to save and share.

## Language

**Palette tray**:
The collection of colors a visitor assembles while using the tool. It is restored on their next visit, but lives only in this browser and is not tied to an account — it can be lost if local storage is cleared, and it is not visible on other devices or shareable until saved.
_Avoid_: Working palette, draft palette, basket

**Saved palette**:
A palette committed to the signed-in user's account, with a name, slug, and shareable page — durable across devices. Creating one requires sign-in.
_Avoid_: Stored palette, saved colors

**Source image**:
The image a visitor uploads on the Image Color Picker page to extract a palette from. It lives only in the browser — never uploaded to a server — so it cannot be shared or restored after a reload.
_Avoid_: Photo, upload, picture

**Sample point**:
A draggable circle overlaid on the source image marking where one palette color is taken from. A sample point's color is exactly the pixel beneath it, so moving the circle changes that color. Extraction auto-places sample points at the dominant colors; the visitor can also add their own. Each sample point corresponds to one color in the palette tray.
_Avoid_: Marker, dot, eyedropper (the eyedropper is the act of adding a sample point, not the point itself)
