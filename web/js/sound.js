'use strict';

const Sound = {
  _audio: new Audio('sounds/default.mp3'),

  isMuted() {
    return localStorage.getItem('soundMuted') === 'true';
  },

  play() {
    if (this.isMuted()) return;
    this._audio.loop = true;
    this._audio.play().catch(() => {});
  },

  stop() {
    this._audio.pause();
    this._audio.currentTime = 0;
    this._audio.loop = false;
  }
};