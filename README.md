# Tunnel Lab

An interactive teaching simulator for three tunnelling devices:

- **RTD** (resonant tunneling diode): peak current and negative differential resistance.
- **SET** (single-electron transistor): Coulomb blockade and charge moving one electron at a time.
- **QD** (quantum dot transistor): discrete levels plus charging, with alternating diamonds from shell filling.

Each device has a 3D model of the real structure and a 3D energy landscape. Electrons move at their true energies. The app also has live linked plots (band diagram, I–V, stability diagram or transmission spectrum, gate sweep), plain-language narration, and six self-checking experiments.

## Physics

| Device | Model |
|---|---|
| RTD | Transfer-matrix transmission through the biased double barrier (0.25 nm slices), Tsu–Esaki current, emitter Fermi level from 10¹⁸ cm⁻³ doping |
| SET | Orthodox theory: tunnel rates Γ = ΔF/(q²R)/(1−e^{−ΔF/kT}), stationary master equation for the island charge N |
| QD | Constant-interaction model: charging energy + spin-degenerate orbitals (Δ = 2πħ²/m*A), sequential tunnelling with fast relaxation |

The 3D electrons come from a kinetic Monte Carlo of the same rates, slowed from GHz to human time. In the RTD landscape, each electron's fate at the barrier is drawn from the real T(E).

`npm run test:physics` checks the solvers against textbook results:
- The single-barrier transmission matches the analytic formula.
- The symmetric resonance gives T = 1.
- The I–V curve shows negative differential resistance.
- The SET peak spacing is e/Cg, and the diamond tip is at Ec.
- The QD addition energies alternate Ec, Ec+Δ.

**This is a teaching model.** It leaves out self-consistent charge (Schrödinger–Poisson), NEGF, cotunnelling, and spin and phonon effects.

## Run

```bash
npm install
npm run dev        # http://localhost:5193
npm run build      # static site in dist/
```

Deep links: `#rtd`, `#set`, `#qd`, and the same with `-landscape` appended (for example `#qd-landscape`).
Keys: `1` `2` `3` switch device, `V` toggles device / landscape. Drag on any plot to move the operating point.
