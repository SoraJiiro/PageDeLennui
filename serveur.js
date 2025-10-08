require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 7550;
const HOTE = "10.166.176.200"; // Ip de la machine --> ipconig sur windows (adresse ipv4)
//                                   --> hostname -I sur linux

const HOTEIP = HOTE;

const app = express();
const serveur = http.createServer(app);
const io = new Server(serveur, {}); // RIEN METTRE ICI SINON BUG

var blacklist = ["192.168.197.197", "192.168.197.1"];

const WEBROOT = path.join(__dirname, "Public");

app.use((req, res, next) => {
  const ip = (
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    ""
  ).replace("::ffff:", "");
  if (blacklist.includes(ip)) {
    console.log(`🚫 Accès refusé à ${ip} (HTTP blacklist)`);
    res.status(403).send(`
          <html dir="ltr" lang="fr"><head>
        <meta charset="utf-8">
        <meta name="color-scheme" content="light dark">
        <meta name="theme-color" content="#fff">
        <meta name="viewport" content="width=device-width, initial-scale=1.0,
                                 maximum-scale=1.0, user-scalable=no">
        <title>${HOTEIP}</title>
        <style>

a {
  color: var(--link-color);
}

body {
  --background-color: #fff;
  --error-code-color: var(--google-gray-700);
  --google-blue-50: rgb(232, 240, 254);
  --google-blue-100: rgb(210, 227, 252);
  --google-blue-300: rgb(138, 180, 248);
  --google-blue-600: rgb(26, 115, 232);
  --google-blue-700: rgb(25, 103, 210);
  --google-gray-100: rgb(241, 243, 244);
  --google-gray-300: rgb(218, 220, 224);
  --google-gray-500: rgb(154, 160, 166);
  --google-gray-50: rgb(248, 249, 250);
  --google-gray-600: rgb(128, 134, 139);
  --google-gray-700: rgb(95, 99, 104);
  --google-gray-800: rgb(60, 64, 67);
  --google-gray-900: rgb(32, 33, 36);
  --heading-color: var(--google-gray-900);
  --link-color: rgb(88, 88, 88);
  --primary-button-fill-color-active: var(--google-blue-700);
  --primary-button-fill-color: var(--google-blue-600);
  --primary-button-text-color: #fff;
  --quiet-background-color: rgb(247, 247, 247);
  --secondary-button-border-color: var(--google-gray-500);
  --secondary-button-fill-color: #fff;
  --secondary-button-hover-border-color: var(--google-gray-600);
  --secondary-button-hover-fill-color: var(--google-gray-50);
  --secondary-button-text-color: var(--google-gray-700);
  --small-link-color: var(--google-gray-700);
  --text-color: var(--google-gray-700);
  background: var(--background-color);
  color: var(--text-color);
  word-wrap: break-word;
}

.nav-wrapper .secondary-button {
  background: var(--secondary-button-fill-color);
  border: 1px solid var(--secondary-button-border-color);
  color: var(--secondary-button-text-color);
  float: none;
  margin: 0;
  padding: 8px 16px;
}

.hidden {
  display: none;
}

html {
  -webkit-text-size-adjust: 100%;
  font-size: 125%;
}

.icon {
  background-repeat: no-repeat;
  background-size: 100%;
}

@media (prefers-color-scheme: dark) {
  body {
    --background-color: var(--google-gray-900);
    --error-code-color: var(--google-gray-500);
    --heading-color: var(--google-gray-500);
    --link-color: var(--google-blue-300);
    --primary-button-fill-color-active: rgb(129, 162, 208);
    --primary-button-fill-color: var(--google-blue-300);
    --primary-button-text-color: var(--google-gray-900);
    --quiet-background-color: var(--background-color);
    --secondary-button-border-color: var(--google-gray-700);
    --secondary-button-fill-color: var(--google-gray-900);
    --secondary-button-hover-fill-color: rgb(48, 51, 57);
    --secondary-button-text-color: var(--google-blue-300);
    --small-link-color: var(--google-blue-300);
    --text-color: var(--google-gray-500);
  }
}
</style>
        <style>/* Copyright 2014 The Chromium Authors
   Use of this source code is governed by a BSD-style license that can be
   found in the LICENSE file. */

button {
  border: 0;
  border-radius: 20px;
  box-sizing: border-box;
  color: var(--primary-button-text-color);
  cursor: pointer;
  float: right;
  font-size: .875em;
  margin: 0;
  padding: 8px 16px;
  transition: box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

[dir='rtl'] button {
  float: left;
}

.bad-clock button,
.captive-portal button,
.https-only button,
.insecure-form button,
.lookalike-url button,
.main-frame-blocked button,
.neterror button,
.pdf button,
.ssl button,
.enterprise-block button,
.enterprise-warn button,
.managed-profile-required button,
.safe-browsing-billing button,
.supervised-user-verify button,
.supervised-user-verify-subframe button {
  background: var(--primary-button-fill-color);
}

button:active {
  background: var(--primary-button-fill-color-active);
  outline: 0;
}

#debugging {
  display: inline;
  overflow: auto;
}

.debugging-content {
  line-height: 1em;
  margin-bottom: 0;
  margin-top: 1em;
}

.debugging-content-fixed-width {
  display: block;
  font-family: monospace;
  font-size: 1.2em;
  margin-top: 0.5em;
}

.debugging-title {
  font-weight: bold;
}

#details {
  margin: 0 0 50px;
}

#details p:not(:first-of-type) {
  margin-top: 20px;
}

.secondary-button:active {
  border-color: white;
  box-shadow: 0 1px 2px 0 rgba(60, 64, 67, .3),
      0 2px 6px 2px rgba(60, 64, 67, .15);
}

.secondary-button:hover {
  background: var(--secondary-button-hover-fill-color);
  border-color: var(--secondary-button-hover-border-color);
  text-decoration: none;
}

.error-code {
  color: var(--error-code-color);
  font-size: .8em;
  margin-top: 12px;
  text-transform: uppercase;
}

#error-debugging-info {
  font-size: 0.8em;
}

h1 {
  color: var(--heading-color);
  font-size: 1.6em;
  font-weight: normal;
  line-height: 1.25em;
  margin-bottom: 16px;
}

h2 {
  font-size: 1.2em;
  font-weight: normal;
}

.icon {
  height: 72px;
  margin: 0 0 40px;
  width: 72px;
}

input[type=checkbox] {
  opacity: 0;
}

input[type=checkbox]:focus ~ .checkbox::after {
  outline: -webkit-focus-ring-color auto 5px;
}

.interstitial-wrapper {
  box-sizing: border-box;
  font-size: 1em;
  line-height: 1.6em;
  margin: 14vh auto 0;
  max-width: 600px;
  width: 100%;
}

#main-message > p {
  display: inline;
}

#extended-reporting-opt-in {
  font-size: .875em;
  margin-top: 32px;
}

#extended-reporting-opt-in label {
  display: grid;
  grid-template-columns: 1.8em 1fr;
  position: relative;
}

#enhanced-protection-message {
  border-radius: 20px;
  font-size: 1em;
  margin-top: 32px;
  padding: 10px 5px;
}

#enhanced-protection-message a {
  color: var(--google-red-10);
}

#enhanced-protection-message label {
  display: grid;
  grid-template-columns: 2.5em 1fr;
  position: relative;
}

#enhanced-protection-message div {
  margin: 0.5em;
}

#enhanced-protection-message .icon {
  height: 1.5em;
  vertical-align: middle;
  width: 1.5em;
}

.nav-wrapper {
  margin-top: 51px;
}

.nav-wrapper::after {
  clear: both;
  content: '';
  display: table;
  width: 100%;
}

.small-link {
  color: var(--small-link-color);
  font-size: .875em;
}

.checkboxes {
  flex: 0 0 24px;
}

.checkbox {
  --padding: .9em;
  background: transparent;
  display: block;
  height: 1em;
  left: -1em;
  padding-inline-start: var(--padding);
  position: absolute;
  right: 0;
  top: -.5em;
  width: 1em;
}

.checkbox::after {
  border: 1px solid white;
  border-radius: 2px;
  content: '';
  height: 1em;
  left: var(--padding);
  position: absolute;
  top: var(--padding);
  width: 1em;
}

.checkbox::before {
  background: transparent;
  border: 2px solid white;
  border-inline-end-width: 0;
  border-top-width: 0;
  content: '';
  height: .2em;
  left: calc(.3em + var(--padding));
  opacity: 0;
  position: absolute;
  top: calc(.3em  + var(--padding));
  transform: rotate(-45deg);
  width: .5em;
}

input[type=checkbox]:checked ~ .checkbox::before {
  opacity: 1;
}

@media (max-width: 700px) {
  .interstitial-wrapper {
    padding: 0 10%;
  }

  #error-debugging-info {
    overflow: auto;
  }
}

@media (max-width: 420px) {
  button,
  [dir='rtl'] button,
  .small-link {
    float: none;
    font-size: .825em;
    font-weight: 500;
    margin: 0;
    width: 100%;
  }

  button {
    padding: 16px 24px;
  }

  #details {
    margin: 20px 0 20px 0;
  }

  #details p:not(:first-of-type) {
    margin-top: 10px;
  }

  .secondary-button:not(.hidden) {
    display: block;
    margin-top: 20px;
    text-align: center;
    width: 100%;
  }

  .interstitial-wrapper {
    padding: 0 5%;
  }

  #extended-reporting-opt-in {
    margin-top: 24px;
  }

  #enhanced-protection-message {
    margin-top: 24px;
  }

  .nav-wrapper {
    margin-top: 30px;
  }
}

/**
 * Mobile specific styling.
 * Navigation buttons are anchored to the bottom of the screen.
 * Details message replaces the top content in its own scrollable area.
 */

@media (max-width: 420px) {
  .nav-wrapper .secondary-button {
    border: 0;
    margin: 16px 0 0;
    margin-inline-end: 0;
    padding-bottom: 16px;
    padding-top: 16px;
  }
}

/* Fixed nav. */
@media (min-width: 240px) and (max-width: 420px) and
       (min-height: 401px),
       (min-width: 421px) and (min-height: 240px) and
       (max-height: 560px) {
  body .nav-wrapper {
    background: var(--background-color);
    bottom: 0;
    box-shadow: 0 -12px 24px var(--background-color);
    left: 0;
    margin: 0 auto;
    max-width: 736px;
    padding-inline-end: 24px;
    padding-inline-start: 24px;
    position: fixed;
    right: 0;
    width: 100%;
    z-index: 2;
  }

  .interstitial-wrapper {
    max-width: 736px;
  }

  #details,
  #main-content {
    padding-bottom: 40px;
  }

  #details {
    padding-top: 5.5vh;
  }

  button.small-link {
    color: var(--google-blue-600);
  }
}

@media (max-width: 420px) and (orientation: portrait),
       (max-height: 560px) {
  body {
    margin: 0 auto;
  }

  button,
  [dir='rtl'] button,
  button.small-link,
  .nav-wrapper .secondary-button {
    font-family: Roboto-Regular,Helvetica;
    font-size: .933em;
    margin: 6px 0;
    transform: translatez(0);
  }

  .nav-wrapper {
    box-sizing: border-box;
    padding-bottom: 8px;
    width: 100%;
  }

  #details {
    box-sizing: border-box;
    height: auto;
    margin: 0;
    opacity: 1;
    transition: opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  #details.hidden,
  #main-content.hidden {
    height: 0;
    opacity: 0;
    overflow: hidden;
    padding-bottom: 0;
    transition: none;
  }

  h1 {
    font-size: 1.5em;
    margin-bottom: 8px;
  }

  .icon {
    margin-bottom: 5.69vh;
  }

  .interstitial-wrapper {
    box-sizing: border-box;
    margin: 7vh auto 12px;
    padding: 0 24px;
    position: relative;
  }

  .interstitial-wrapper p {
    font-size: .95em;
    line-height: 1.61em;
    margin-top: 8px;
  }

  #main-content {
    margin: 0;
    transition: opacity 100ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .small-link {
    border: 0;
  }

  .suggested-left > #control-buttons,
  .suggested-right > #control-buttons {
    float: none;
    margin: 0;
  }
}

@media (min-width: 421px) and (min-height: 500px) and (max-height: 560px) {
  .interstitial-wrapper {
    margin-top: 10vh;
  }
}

@media (min-height: 400px) and (orientation:portrait) {
  .interstitial-wrapper {
    margin-bottom: 145px;
  }
}

@media (min-height: 299px) {
  .nav-wrapper {
    padding-bottom: 16px;
  }
}

@media (max-height: 560px) and (min-height: 240px) and (orientation:landscape) {
  .extended-reporting-has-checkbox #details {
    padding-bottom: 80px;
  }
}

@media (min-height: 500px) and (max-height: 650px) and (max-width: 414px) and
       (orientation: portrait) {
  .interstitial-wrapper {
    margin-top: 7vh;
  }
}

@media (min-height: 650px) and (max-width: 414px) and (orientation: portrait) {
  .interstitial-wrapper {
    margin-top: 10vh;
  }
}

/* Small mobile screens. No fixed nav. */
@media (max-height: 400px) and (orientation: portrait),
       (max-height: 239px) and (orientation: landscape),
       (max-width: 419px) and (max-height: 399px) {
  .interstitial-wrapper {
    display: flex;
    flex-direction: column;
    margin-bottom: 0;
  }

  #details {
    flex: 1 1 auto;
    order: 0;
  }

  #main-content {
    flex: 1 1 auto;
    order: 0;
  }

  .nav-wrapper {
    flex: 0 1 auto;
    margin-top: 8px;
    order: 1;
    padding-inline-end: 0;
    padding-inline-start: 0;
    position: relative;
    width: 100%;
  }

  button,
  .nav-wrapper .secondary-button {
    padding: 16px 24px;
  }

  button.small-link {
    color: var(--google-blue-600);
  }
}

@media (max-width: 239px) and (orientation: portrait) {
  .nav-wrapper {
    padding-inline-end: 0;
    padding-inline-start: 0;
  }
}
</style>
        <style>/* Copyright 2013 The Chromium Authors
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file. */

/* Don't use the main frame div when the error is in a subframe. */
html[subframe] #main-frame-error {
  display: none;
}

/* Don't use the subframe error div when the error is in a main frame. */
html:not([subframe]) #sub-frame-error {
  display: none;
}

h1 {
  margin-top: 0;
  word-wrap: break-word;
}

h1 span {
  font-weight: 500;
}

a {
  text-decoration: none;
}

.icon {
  -webkit-user-select: none;
  display: inline-block;
}

.hidden {
  display: none;
}

#suggestions-list a {
  color: var(--google-blue-600);
}

#suggestions-list p {
  margin-block-end: 0;
}

#suggestions-list ul {
  margin-top: 0;
}

.single-suggestion {
  list-style-type: none;
  padding-inline-start: 0;
}

.link-button {
  color: rgb(66, 133, 244);
  display: inline-block;
  font-weight: bold;
  text-transform: uppercase;
}

#sub-frame-error-details {

  color: #8F8F8F;

  /* Not done on mobile for performance reasons. */
  text-shadow: 0 1px 0 rgba(255,255,255,0.3);

}

.secondary-button {
  background: #d9d9d9;
  color: #696969;
  margin-inline-end: 16px;
}

.snackbar {
  background: #323232;
  border-radius: 2px;
  bottom: 24px;
  box-sizing: border-box;
  color: #fff;
  font-size: .87em;
  left: 24px;
  max-width: 568px;
  min-width: 288px;
  opacity: 0;
  padding: 16px 24px 12px;
  position: fixed;
  transform: translateY(90px);
  will-change: opacity, transform;
  z-index: 999;
}

.snackbar-show {
  -webkit-animation:
    show-snackbar 250ms cubic-bezier(0, 0, 0.2, 1) forwards,
    hide-snackbar 250ms cubic-bezier(0.4, 0, 1, 1) forwards 5s;
}

@-webkit-keyframes show-snackbar {
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@-webkit-keyframes hide-snackbar {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(90px);
  }
}

.suggestions {
  margin-top: 18px;
}

.suggestion-header {
  font-weight: bold;
  margin-bottom: 4px;
}

.suggestion-body {
  color: #777;
}

/* Decrease padding at low sizes. */
@media (max-width: 640px), (max-height: 640px) {
  h1 {
    margin: 0 0 15px;
  }
  .suggestions {
    margin-top: 10px;
  }
  .suggestion-header {
    margin-bottom: 0;
  }
}

#cancel-save-page-button {
  background-image: url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48Y2xpcFBhdGggaWQ9Im1hc2siPjxwYXRoIGQ9Ik0xMiAyQzYuNSAyIDIgNi41IDIgMTJzNC41IDEwIDEwIDEwIDEwLTQuNSAxMC0xMFMxNy41IDIgMTIgMnptNSAxNkg3di0yaDEwdjJ6bS02LjctNEw3IDEwLjdsMS40LTEuNCAxLjkgMS45IDUuMy01LjNMMTcgNy4zIDEwLjMgMTR6IiBmaWxsPSIjOUFBMEE2Ii8+PC9jbGlwUGF0aD48cGF0aCBjbGlwLXBhdGg9InVybCgjbWFzaykiIGZpbGw9IiM5QUEwQTYiIGQ9Ik0wIDBoMjR2MjRIMHoiLz48cGF0aCBjbGlwLXBhdGg9InVybCgjbWFzaykiIGZpbGw9IiMxQTczRTgiIHN0eWxlPSJhbmltYXRpb246b2ZmbGluZUFuaW1hdGlvbiA0cyBpbmZpbml0ZSIgZD0iTTAgMGgyNHYyNEgweiIvPjxzdHlsZT5Aa2V5ZnJhbWVzIG9mZmxpbmVBbmltYXRpb257MCUsMzUle2hlaWdodDowfTYwJXtoZWlnaHQ6MTAwJX05MCV7ZmlsbC1vcGFjaXR5OjF9dG97ZmlsbC1vcGFjaXR5OjB9fTwvc3R5bGU+PC9zdmc+);
  background-position: right 27px center;
  background-repeat: no-repeat;
  border: 1px solid var(--google-gray-300);
  border-radius: 5px;
  color: var(--google-gray-700);
  margin-bottom: 26px;
  padding-bottom: 16px;
  padding-inline-end: 88px;
  padding-inline-start: 16px;
  padding-top: 16px;
  text-align: start;
}

html[dir='rtl'] #cancel-save-page-button {
  background-position: left 27px center;
}

#save-page-for-later-button {
  display: flex;
  justify-content: start;
}

#save-page-for-later-button a::before {
  content: url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxLjJlbSIgaGVpZ2h0PSIxLjJlbSIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNNSAyMGgxNHYtMkg1bTE0LTloLTRWM0g5djZINWw3IDcgNy03eiIgZmlsbD0iIzQyODVGNCIvPjwvc3ZnPg==);
  display: inline-block;
  margin-inline-end: 4px;
  vertical-align: -webkit-baseline-middle;
}

.hidden#save-page-for-later-button {
  display: none;
}

/* Don't allow overflow when in a subframe. */
html[subframe] body {
  overflow: hidden;
}

#sub-frame-error {
  -webkit-align-items: center;
  -webkit-flex-flow: column;
  -webkit-justify-content: center;
  background-color: #DDD;
  display: -webkit-flex;
  height: 100%;
  left: 0;
  position: absolute;
  text-align: center;
  top: 0;
  transition: background-color 200ms ease-in-out;
  width: 100%;
}

#sub-frame-error:hover {
  background-color: #EEE;
}

#sub-frame-error .icon-generic {
  margin: 0 0 16px;
}

#sub-frame-error-details {
  margin: 0 10px;
  text-align: center;
  opacity: 0;
}

/* Show details only when hovering. */
#sub-frame-error:hover #sub-frame-error-details {
  opacity: 1;
}

/* If the iframe is too small, always hide the error code. */
/* TODO(mmenke): See if overflow: no-display works better, once supported. */
@media (max-width: 200px), (max-height: 95px) {
  #sub-frame-error-details {
    display: none;
  }
}

/* Adjust icon for small embedded frames in apps. */
@media (max-height: 100px) {
  #sub-frame-error .icon-generic {
    height: auto;
    margin: 0;
    padding-top: 0;
    width: 25px;
  }
}

/* details-button is special; it's a <button> element that looks like a link. */
#details-button {
  box-shadow: none;
  min-width: 0;
}

/* Styles for platform dependent separation of controls and details button. */
.suggested-left > #control-buttons,
.suggested-right > #details-button {
  float: left;
}

.suggested-right > #control-buttons,
.suggested-left > #details-button {
  float: right;
}

.suggested-left .secondary-button {
  margin-inline-end: 0;
  margin-inline-start: 16px;
}

#details-button.singular {
  float: none;
}

/* download-button shows both icon and text. */
#download-button {
  padding-bottom: 4px;
  padding-top: 4px;
  position: relative;
}

#download-button::before {
  background: image-set(
      url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAQAAABKfvVzAAAAO0lEQVQ4y2NgGArgPxIY1YChsOE/LtBAmpYG0mxpIOSDBpKUo2lpIDZxNJCkHKqlYZAla3RAHQ1DFgAARRroHyLNTwwAAAAASUVORK5CYII=) 1x,
      url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAQAAAD9CzEMAAAAZElEQVRYw+3Ruw3AMAwDUY3OzZUmRRD4E9iim9wNwAdbEURHyk4AAAAATiCVK8lLyPsKeT9K3lsownnunfkPxO78hKiYHxBV8x2icr5BVM+/CMf8g3DN34Rzns6ViwHUAUQ/6wIAd5Km7l6c8AAAAABJRU5ErkJggg==) 2x)
    no-repeat;
  content: '';
  display: inline-block;
  height: 24px;
  margin-inline-end: 4px;
  margin-inline-start: -4px;
  vertical-align: middle;
  width: 24px;
}

#download-button:disabled {
  background: rgb(180, 206, 249);
  color: rgb(255, 255, 255);
}

#buttons::after {
  clear: both;
  content: '';
  display: block;
  width: 100%;
}

/* Offline page */
html[dir='rtl'] .runner-container,
html[dir='rtl'].offline .icon-offline {
  transform: scaleX(-1);
}

.offline {
  transition: filter 1.5s cubic-bezier(0.65, 0.05, 0.36, 1),
              background-color 1.5s cubic-bezier(0.65, 0.05, 0.36, 1);

  will-change: filter, background-color;

}

.offline body {
  transition: background-color 1.5s cubic-bezier(0.65, 0.05, 0.36, 1);
}

.offline #main-message > p {
  display: none;
}

.offline.inverted {
  background-color: #fff;
  filter: invert(1);
}

.offline.inverted body {
  background-color: #fff;
}

.offline .interstitial-wrapper {
  color: var(--text-color);
  font-size: 1em;
  line-height: 1.55;
  margin: 0 auto;
  max-width: 600px;
  padding-top: 100px;
  position: relative;
  width: 100%;
}

.offline .runner-container {
  direction: ltr;
  height: 150px;
  max-width: 600px;
  overflow: hidden;
  position: absolute;
  top: 35px;
  width: 44px;
}

.offline .runner-container:focus {
  outline: none;
}

.offline .runner-container:focus-visible {
  outline: 3px solid var(--google-blue-300);
}

.offline .runner-canvas {
  height: 150px;
  max-width: 600px;
  opacity: 1;
  overflow: hidden;
  position: absolute;
  top: 0;
  z-index: 10;
}

.offline .controller {
  height: 100vh;
  left: 0;
  position: absolute;
  top: 0;
  width: 100vw;
  z-index: 9;
}

#offline-resources {
  display: none;
}

#offline-instruction {
  image-rendering: pixelated;
  left: 0;
  margin: auto;
  position: absolute;
  right: 0;
  top: 60px;
  width: fit-content;
}

.offline-runner-live-region {
  bottom: 0;
  clip-path: polygon(0 0, 0 0, 0 0);
  color: var(--background-color);
  display: block;
  font-size: xx-small;
  overflow: hidden;
  position: absolute;
  text-align: center;
  transition: color 1.5s cubic-bezier(0.65, 0.05, 0.36, 1);
  user-select: none;
}

/* Custom toggle */
.slow-speed-option {
  align-items: center;
  background: var(--google-gray-50);
  border-radius: 24px/50%;
  bottom: 0;
  color: var(--error-code-color);
  display: inline-flex;
  font-size: 1em;
  left: 0;
  line-height: 1.1em;
  margin: 5px auto;
  padding: 2px 12px 3px 20px;
  position: absolute;
  right: 0;
  width: max-content;
  z-index: 999;
}

.slow-speed-option.hidden {
  display: none;
}

.slow-speed-option [type=checkbox] {
  opacity: 0;
  pointer-events: none;
  position: absolute;
}

.slow-speed-option .slow-speed-toggle {
  cursor: pointer;
  margin-inline-start: 8px;
  padding: 8px 4px;
  position: relative;
}

.slow-speed-option [type=checkbox]:disabled ~ .slow-speed-toggle {
  cursor: default;
}

.slow-speed-option-label [type=checkbox] {
  opacity: 0;
  pointer-events: none;
  position: absolute;
}

.slow-speed-option .slow-speed-toggle::before,
.slow-speed-option .slow-speed-toggle::after {
  content: '';
  display: block;
  margin: 0 3px;
  transition: all 100ms cubic-bezier(0.4, 0, 1, 1);
}

.slow-speed-option .slow-speed-toggle::before {
  background: rgb(189,193,198);
  border-radius: 0.65em;
  height: 0.9em;
  width: 2em;
}

.slow-speed-option .slow-speed-toggle::after {
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 40%);
  height: 1.2em;
  position: absolute;
  top: 51%;
  transform: translate(-20%, -50%);
  width: 1.1em;
}

.slow-speed-option [type=checkbox]:focus + .slow-speed-toggle {
  box-shadow: 0 0 8px rgb(94, 158, 214);
  outline: 1px solid rgb(93, 157, 213);
}

.slow-speed-option [type=checkbox]:checked + .slow-speed-toggle::before {
  background: var(--google-blue-600);
  opacity: 0.5;
}

.slow-speed-option [type=checkbox]:checked + .slow-speed-toggle::after {
  background: var(--google-blue-600);
  transform: translate(calc(2em - 90%), -50%);
}

.slow-speed-option [type=checkbox]:checked:disabled +
  .slow-speed-toggle::before {
  background: rgb(189,193,198);
}

.slow-speed-option [type=checkbox]:checked:disabled +
  .slow-speed-toggle::after {
  background: var(--google-gray-50);
}

@media (max-width: 420px) {
  #download-button {
    padding-bottom: 12px;
    padding-top: 12px;
  }

  .suggested-left > #control-buttons,
  .suggested-right > #control-buttons {
    float: none;
  }

  .snackbar {
    border-radius: 0;
    bottom: 0;
    left: 0;
    width: 100%;
  }
}

@media (max-height: 350px) {
  h1 {
    margin: 0 0 15px;
  }

  .icon-offline {
    margin: 0 0 10px;
  }

  .interstitial-wrapper {
    margin-top: 5%;
  }

  .nav-wrapper {
    margin-top: 30px;
  }
}

@media (min-width: 420px) and (max-width: 736px) and
       (min-height: 240px) and (max-height: 420px) and
       (orientation:landscape) {
  .interstitial-wrapper {
    margin-bottom: 100px;
  }
}

@media (max-width: 360px) and (max-height: 480px) {
  .offline .interstitial-wrapper {
    padding-top: 60px;
  }

  .offline .runner-container {
    top: 8px;
  }
}

@media (min-height: 240px) and (orientation: landscape) {
  .offline .interstitial-wrapper {
    margin-bottom: 90px;
  }

  .icon-offline {
    margin-bottom: 20px;
  }
}

@media (max-height: 320px) and (orientation: landscape) {
  .icon-offline {
    margin-bottom: 0;
  }

  .offline .runner-container {
    top: 10px;
  }
}

@media (max-width: 240px) {
  button {
    padding-inline-end: 12px;
    padding-inline-start: 12px;
  }

  .interstitial-wrapper {
    overflow: inherit;
    padding: 0 8px;
  }
}

@media (max-width: 120px) {
  button {
    width: auto;
  }
}

.arcade-mode,
.arcade-mode .runner-container,
.arcade-mode .runner-canvas {
  image-rendering: pixelated;
  max-width: 100%;
  overflow: hidden;
}

.arcade-mode #buttons,
.arcade-mode #main-content {
  opacity: 0;
  overflow: hidden;
}

.arcade-mode .interstitial-wrapper {
  height: 100vh;
  max-width: 100%;
  overflow: hidden;
}

.arcade-mode .runner-container {
  left: 0;
  margin: auto;
  right: 0;
  transform-origin: top center;
  transition: transform 250ms cubic-bezier(0.4, 0, 1, 1) 400ms;
  z-index: 2;
}

@media (prefers-color-scheme: dark) {
  .icon {
    filter: invert(1);
  }

  .offline .runner-canvas {
    filter: invert(1);
  }

  .offline.inverted {
    background-color: var(--background-color);
    filter: invert(0);
  }

  .offline.inverted body {
    background-color: #fff;
  }

  .offline.inverted .offline-runner-live-region {
    color: #fff;
  }

  #suggestions-list a {
    color: var(--link-color);
  }

  .slow-speed-option {
    background: var(--google-gray-800);
    color: var(--google-gray-100);
  }

  .slow-speed-option .slow-speed-toggle::before,
  .slow-speed-option [type=checkbox]:checked:disabled +
    .slow-speed-toggle::before {
     background: rgb(189,193,198);
  }

  .slow-speed-option [type=checkbox]:checked + .slow-speed-toggle::after,
  .slow-speed-option [type=checkbox]:checked + .slow-speed-toggle::before {
    background: var(--google-blue-300);
  }
}

#main-frame-error:not(.showing-details) #details {
  display: none;
}

@media (min-width: 240px) and (max-width: 420px) and (min-height: 401px),
       (min-height: 240px) and (max-height: 560px) and (min-width: 421px) {
  #main-frame-error.showing-details #main-content,
  #main-frame-error.showing-details .runner-container {
    display: none;
  }
}
</style>


    </head>
    <body class="neterror"
        style="font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 75%">
        <div id="content"><!---->
            <div id="main-frame-error" class="interstitial-wrapper ">
                <div id="main-content">
                    <div class="icon icon-generic"></div>
                    <div id="main-message">
                        <h1>
                            <span>Ce site est inaccessible</span>
                        </h1>
                        <!--?lit$653458752$-->
                        <p><strong>192.168.1.70</strong> n'autorise pas la
                            connexion.</p>

                        <!--?lit$653458752$-->
                        <div id="suggestions-list">
                            <p><!--?lit$653458752$-->Voici quelques
                                conseils&nbsp;:</p>
                            <ul class>
                                <!--?lit$653458752$--><!---->
                                <li>Vérifier la connexion</li>
                                <!----><!---->
                                <li><a href="#buttons"
                                        onclick="toggleHelpBox()">Vérifier le
                                        proxy et le pare-feu</a></li>
                                <!---->
                            </ul>
                        </div>

                        <div
                            class="error-code"><!--?lit$653458752$-->ERR_CONNECTION_REFUSED</div>

                        <!--?lit$653458752$-->
                    </div>
                </div>
                <div id="buttons" class="nav-wrapper suggested-left">
                    <div id="control-buttons">
                        <!--?lit$653458752$-->
                        <button id="reload-button"
                            class="blue-button text-button"
                            data-url="http://192.168.1.70:7750/">
                            <!--?lit$653458752$-->Actualiser
                        </button>

                        <!--?lit$653458752$-->
                    </div>
                    <!--?lit$653458752$-->
                    <button id="details-button"
                        class="secondary-button text-button
              small-link ">
                        <!--?lit$653458752$-->Détails
                    </button>

                </div>
                <!--?lit$653458752$-->
                <div id="details">
                    <!--?lit$653458752$--><!---->
                    <div class="suggestions">
                        <div class="suggestion-header">Vérifiez votre connexion
                            Internet</div>
                        <div class="suggestion-body">Vérifiez les câbles et
                            redémarrez votre routeur, votre modem
                            ou tout autre périphérique réseau utilisé.</div>
                    </div>
                    <!----><!---->
                    <div class="suggestions">
                        <div class="suggestion-header">Autorisez Chrome à
                            accéder au réseau dans les paramètres du pare-feu ou
                            de l'antivirus.</div>
                        <div class="suggestion-body">S'il est déjà répertorié en
                            tant que programme autorisé à accéder au réseau,
                            essayez de le supprimer de la liste, puis de le
                            rajouter.</div>
                    </div>
                    <!----><!---->
                    <div class="suggestions">
                        <div class="suggestion-header">Si vous utilisez un
                            serveur proxy…</div>
                        <div class="suggestion-body">Accédez au
                            menu Chrome &gt;
                            <span>Paramètres</span>
                            &gt;
                            <span>Afficher les paramètres avancés…</span>
                            &gt;
                            <span>Modifier les paramètres du proxy…</span>
                            &gt;
                            Paramètres réseau,
                            puis décochez l'option
                            "Utiliser un serveur proxy pour votre réseau local".</div>
                    </div>
                    <!---->
                </div>

            </div>
            <!--?lit$653458752$-->
            <div id="sub-frame-error">
                <!-- Show details when hovering over the icon, in case the details are
             hidden because they're too large. -->
                <div class="icon "></div>
                <div id="sub-frame-error-details"><strong>192.168.1.70</strong>
                    n'autorise pas la connexion.</div>
            </div>

        </div>

        <script>var loadTimeDataRaw = {"details":"Détails","errorCode":"ERR_CONNECTION_REFUSED","fontfamily":"'Segoe UI', Tahoma, sans-serif","fontfamilyMd":"'Segoe UI', Tahoma, sans-serif","fontsize":"75%","heading":{"msg":"Ce site est inaccessible"},"hideDetails":"Masquer les détails","iconClass":"icon-generic","language":"fr","reloadButton":{"msg":"Actualiser","reloadUrl":"http://192.168.1.70:7750/"},"suggestionsDetails":[{"body":"Vérifiez les câbles et redémarrez votre routeur, votre modem\n    ou tout autre périphérique réseau utilisé.","header":"Vérifiez votre connexion Internet"},{"body":"S'il est déjà répertorié en tant que programme autorisé à accéder au réseau,\n    essayez de le supprimer de la liste, puis de le rajouter.","header":"Autorisez Chrome à accéder au réseau dans les paramètres du pare-feu ou\n        de l'antivirus."},{"body":"Accédez au\n          menu Chrome >\n          \u003Cspan>Paramètres\u003C/span>\n          >\n          \u003Cspan>Afficher les paramètres avancés…\u003C/span>\n          >\n          \u003Cspan>Modifier les paramètres du proxy…\u003C/span>\n          >\n          Paramètres réseau,\n          puis décochez l'option \"Utiliser un serveur proxy pour votre réseau local\".","header":"Si vous utilisez un serveur proxy…"}],"suggestionsSummaryList":[{"summary":"Vérifier la connexion"},{"summary":"\u003Ca href=\"#buttons\" onclick=\"toggleHelpBox()\">Vérifier le proxy et le pare-feu\u003C/a>"}],"suggestionsSummaryListHeader":"Voici quelques conseils :","summary":{"msg":"\u003Cstrong>192.168.1.70\u003C/strong> n'autorise pas la connexion."},"textdirection":"ltr","title":"192.168.1.70"};</script></body></html>
      </script>
    `);
    return;
  }
  next();
});

app.use(express.static(WEBROOT));

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const files = {
  leaderboard: path.join(dataDir, "leaderboard.json"),
  historique: path.join(dataDir, "chat_history.json"),
  chatLogs: path.join(dataDir, "chat_logs.jsonl"),
};

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  } catch (f) {}
  return fallback;
}
function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  } catch (f) {}
}
function appendLog(line) {
  try {
    fs.appendFileSync(files.chatLogs, line + "\n", "utf-8");
  } catch (f) {}
}

let users = new Map();
let scores = readJSON(files.leaderboard, {});
let historique = readJSON(files.historique, []);

function normalizeIp(addr) {
  if (!addr) return "unknown";
  if (Array.isArray(addr)) addr = addr[0];
  if (addr.startsWith("::ffff:")) addr = addr.slice(7);
  if (addr === "::1") return "127.0.0.1";
  return addr;
}
function leaderboardClasse() {
  const arr = Object.entries(scores).map(([ip, score]) => ({
    ip: ip === HOTEIP ? "Hôte" : ip,
    score: Number(score) || 0,
  }));
  arr.sort((a, b) => b.score - a.score || a.ip.localeCompare(b.ip));
  return arr;
}
function broadcastLeaderboard() {
  io.emit("leaderboard:update", leaderboardClasse());
}

const clickWindowMs = 1200;
const clickMaxPerWindow = 22;
const clickBuckets = new Map();

function allowClick(socketId) {
  const now = Date.now();
  const bucket = clickBuckets.get(socketId) || { windowStart: now, count: 0 };
  if (now - bucket.windowStart >= clickWindowMs) {
    bucket.windowStart = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  clickBuckets.set(socketId, bucket);
  return bucket.count <= clickMaxPerWindow;
}

io.on("connection", (socket) => {
  const ip = normalizeIp(
    socket.handshake.headers["x-forwarded-for"] || socket.handshake.address
  );

  if (blacklist.includes(ip)) {
    console.log(
      `❌ Connexion refusée pour IP blacklistée: ${ip} || ` +
        new Date().toLocaleString("fr-FR")
    );
    socket.disconnect(true);
    return;
  }

  let displayName = ip === HOTEIP ? "Hôte" : ip;
  let estHote = ip === HOTEIP;

  socket.emit("you:role", { estHote }); // Envoie le role clientside?

  users.set(socket.id, { name: displayName });

  socket.emit("you:name", displayName);
  socket.emit("chat:history", historique);
  socket.emit("clicker:you", { score: scores[ip] || 0 });
  socket.emit("leaderboard:update", leaderboardClasse());

  io.emit("system:info", `${displayName} a rejoint le chat`);
  io.emit(
    "users:list",
    Array.from(users.values()).map((u) => u.name)
  );

  // MESSAGE HANDLER ICI
  socket.on("chat:message", ({ text }) => {
    const msg = String(text || "").trim();
    if (!msg) return;
    const payload = {
      name: displayName,
      text: msg,
      at: new Date().toISOString(),
    };
    historique.push(payload);
    if (historique.length > 200) historique = historique.slice(-200);
    writeJSON(files.historique, historique);
    appendLog(JSON.stringify(payload));
    io.emit("chat:message", payload);
  });

  // CLICKER HANDLER ICI + LEADERBOARD
  socket.on("clicker:click", () => {
    if (!allowClick(socket.id)) return;
    scores[displayName] = (scores[displayName] || 0) + 1;
    writeJSON(files.leaderboard, scores);
    socket.emit("clicker:you", { score: scores[displayName] });
    broadcastLeaderboard();
  });

  socket.on("clicker:reset", () => {
    scores[displayName] = 0;
    writeJSON(files.leaderboard, scores);
    socket.emit("clicker:you", { score: 0 });
    broadcastLeaderboard();
    console.log(`🔁 Reset effectué pour ${displayName}`);
  });

  socket.on("disconnect", () => {
    const u = users.get(socket.id);
    if (u) {
      io.emit("system:info", `${u.name} a quitté le chat`);
      users.delete(socket.id);
      io.emit(
        "users:list",
        Array.from(users.values()).map((u) => u.name)
      );
    }
    clickBuckets.delete(socket.id);
  });
});

serveur.listen(PORT, HOTE, () => {
  console.log(
    `>>> ✅ Serveur : http://${HOTE}:${PORT} (` +
      new Date().toLocaleDateString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }) +
      ")"
  );
});
