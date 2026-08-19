# Separate Presentation and Interaction Profiles

The homepage will choose its Presentation Profile from viewport geometry and its Interaction Profile from the pointer actually being used, rather than classifying a device as mobile or desktop. A narrow mouse-driven window therefore keeps fine-pointer hover behavior inside a Portrait Composition, while touch on a wide hybrid display receives Touch Focus inside the wide composition. This avoids brittle user-agent categories and allows one device to change interaction methods without changing its layout.
