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
7. **Tab bar covers the Post event button.** The bottom of the form sits under
   the tab bar, so the button is very hard to press. Add bottom padding equal
   to the tab bar height plus the safe area. Check the crew form for the same
   problem.
8. **ZIP field flickers.** It jumps around when you tab out of it. Input
   validation otherwise works (date, time, ZIP). A likely cause is the field
   stripping non-digits on every keystroke (`onChangeText`), which makes iOS
   redraw the field. Reproduce it, then fix it.
9. **Autosave drafts.** Leaving the form (for example by tapping the Events
   tab) currently throws away everything typed. Autosave the form as you type
   and offer to restore it when you come back. Start with one unsaved draft per
   form, kept on the device. More than one is only worth it if organizers ask.
   Saving it as a real draft event in the database is the other option, but
   that creates rows for forms people abandon.
10. **No scroll bar.** Hide the vertical scroll indicator on form screens, and
    probably on every screen, so it feels like a native app.
