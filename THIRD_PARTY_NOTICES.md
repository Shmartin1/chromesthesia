# Third-party notices

Chromesthesia's original code is covered by the root [MIT license](LICENSE). The following vendored UI components retain their upstream license and are not relicensed by that file.

## React Bits

- Author: David Haz, copyright 2026.
- Project: [React Bits](https://reactbits.dev/) / [source repository](https://github.com/DavidHDev/react-bits).
- Pinned source revision: `ca44b3f9ee180676a06d7de8ec6bea84cddff85b`.
- Components: TypeScript default **Blur Text** and **Spotlight Card**, adapted in `apps/web/src/components/react-bits`.
- License: **MIT + Commons Clause License Condition v1.0**. The exact upstream text is preserved in [the component license](apps/web/src/components/react-bits/LICENSE.md).

These components are distributed as part of the Chromesthesia application. Their license allows application use, including commercial use, but restricts selling, sublicensing, or redistributing the components themselves alone, in a bundle, or as a ported version. Preserve the upstream notice when distributing substantial portions. These components are not under an unrestricted MIT license.

Local adaptations add reduced-motion support, accessible text labels, compact card styling, shorter text reveals, and strict TypeScript compatibility.

Other installed dependencies and font assets retain the licenses included in their respective packages. Motion is installed from npm; React Bits source is vendored so no remote script or runtime service is required.
