## v1.1.1

### Map fixes

- **The map toolbar named the wrong place.** Standing in the Crossing, the place name at the top of the map could say Qi'Reshalia, and the Lich Map's marker could jump there too. Some rooms Lich hasn't mapped have a game room number that happens to match one of Lich's own room numbers somewhere else. Lichborne now only takes that match when the room's name agrees.
- **Clicking a map in the world view opens that map.** Clicking a town's side map, like the Crossing Temple, opened the map you were standing in instead.
- **Opening a map lands where it should.** On the Graph map, however you open a map (the world view, the map list, or an exit to another map):
  - **Your own map** shows where you are and follows you.
  - **Any other map** keeps the zoom you were using and centres on its rooms, instead of zooming far out or landing off to one side. The very first map you open fits the whole map. **⊡** still fits a whole map, and **◆** takes you back to yourself.
- **Picking your own map from the map list** now shows where you are, on your level, on both the Genie Maps and Graph views.
- **No more maps parked off to one side.** A map that opened before its panel had finished sizing itself could land at its corner and stay there, on both the Genie Maps and Graph views. It now waits for the panel and then centres.
- **More map, less bar, on the Graph map.** The bar above the map is now one row that only picks the map. The Find box and **Go ▸** moved into the line under the map, which now only reports what Find found, and its list opens upward. What's drawn (Lich links, rooms beyond the map, and the world view's layers) is under a small **⚙** that sits with the A− / A+ buttons in the bottom-right corner, like the options on the Experience windows. A narrow panel gets two rows of map back.
