# Backlog

Work we've agreed to do but haven't scheduled. When an item ships, delete it
here and add it to [CHANGELOG.md](CHANGELOG.md).

## Polish (for 1.0.0)

### Event form

Found while posting an event on iPhone (2026-11-09). The form is
`apps/mobile/src/components/event-form.tsx`.

1. **Native date picker.** Tapping the date field should open the system
   calendar picker instead of a text box.
2. **Native time picker.** Tapping a time field should open the system time
   picker.
3. **Pickers fill the fields.** Date and time are only ever set from the
   picker, so they're always in a valid format. No typing them by hand.
4. **US date format.** Show dates as MM-DD-YYYY, not YYYY-MM-DD. The database
   keeps storing ISO dates. Only what people see and pick changes.
5. **12-hour time.** Show times as 12-hour with AM/PM, not 24-hour.
6. **Address lookup.** Suggest real addresses as you type in the address field
   (Google Places Autocomplete or similar). This adds a paid API key and a
   per-lookup cost. Check pricing before building, and fill ZIP from the chosen
   address so organizers don't type it twice.
7. ~~**Tab bar covers the Post event button.**~~ Fixed in #19.
8. **ZIP field flickers.** It jumps around when you tab out of it. Input
   validation otherwise works (date, time, ZIP). A likely cause is the field
   stripping non-digits on every keystroke (`onChangeText`), which makes iOS
   redraw the field. Reproduce it, then fix it.
9. ~~**Autosave drafts.**~~ Fixed in #19: one autosaved copy per form, on the
   device.
10. **No scroll bar.** Hide the vertical scroll indicator on form screens, and
    probably on every screen, so it feels like a native app.
