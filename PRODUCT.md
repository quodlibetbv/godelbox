# Godelbox product context

## Register

Product: a personal adaptive application canvas. The welcome document remains as an About page.

## Platform

Web. Static hosting on GitHub Pages; desktop Chromium is the prototype's initial runtime target. The welcome document also supports narrow/mobile viewports.

## Purpose and users

A single user can reshape a browser app through prompts and restore saved versions of its code, data, dependencies, and instructions. See the supplied specification for the complete required workflow. The permanent host provides controls and a prompt outside the replaceable application.

## Name and voice

Named in honour of Kurt Friedrich Gödel. The voice is curious, precise, and direct. Self-reference and recoverable change connect the name to the experiment; the welcome text does not attribute invented quotations or product claims to Gödel.

## Current scope

A working browser-only host with a sandboxed canvas, prompt editing, version history, file/error inspection, model settings, persistent allowance, and project backup. The starter is an animated p5.js universe asking “What do you want me to become?” Its form calls the real host editor; animation and local prompt persistence work without a model. Avoid simulated controls, analytics, or remote fonts.

## Design choices

The user opens a personal app and wants its universe to occupy the browser window. Use one slim black header with Start/Stop and icons for Settings, GitHub, and the hideable prompt panel; remove margins, borders, and the extra status strip around the canvas. The prompt starts hidden, keeps unsent text when hidden, sits to the right on desktop, and opens over the app on narrow screens. Put version/file/error controls and detailed status inside it. Keep the header accessible while Settings is open. Utility panels retain a clear light reading surface with dark readable text and an olive accent. Use familiar system typography, explicit states, and visible keyboard focus. Keep recovery controls available when generated code breaks.

Inside that workbench, the starter is a night sky: a slowly rotating spiral galaxy, drifting stars, a warm core, and occasional meteors. A clear white question and amber Become button sit over the scene. Keep the form legible against a solid dark surface. Honour reduced motion, provide an explicit pause control, and keep the prompt accessible on narrow screens. This atmosphere belongs to the replaceable app, while host controls keep their familiar appearance.
