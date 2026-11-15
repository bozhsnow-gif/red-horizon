'use strict';

// Playback starts in a user click handler to satisfy browser autoplay policies.
class MissionIntro {
  constructor({ onStart, onFinish }) {
    this.dialog = document.querySelector('#mission-intro');
    this.video = document.querySelector('#intro-video');
    this.status = document.querySelector('#intro-status');
    this.playButton = document.querySelector('#intro-play');
    this.skipButton = document.querySelector('#intro-skip');
    this.onStart = onStart;
    this.onFinish = onFinish;
    this.active = false;
    this.completed = false;
    this.playAttempt = 0;

    this.video.addEventListener('ended', () => this.finish());
    this.video.addEventListener('error', () => this.finish('unavailable'));
    this.video.addEventListener('playing', () => {
      if (!this.active) return;
      this.status.textContent = '';
      this.playButton.textContent = 'PAUSE';
      this.playButton.hidden = false;
    });
    this.video.addEventListener('pause', () => {
      if (!this.active) return;
      this.playButton.textContent = 'PLAY';
      this.playButton.hidden = false;
    });
    this.video.addEventListener('waiting', () => {
      if (this.active) this.status.textContent = 'Loading landing sequence...';
    });
    this.skipButton.addEventListener('click', () => this.finish());
    this.playButton.addEventListener('click', () => {
      if (!this.active) return;
      if (this.video.paused) this.play();
      else this.video.pause();
    });
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.finish();
    });
    // Closing the native dialog by another means must also unpause the mission.
    this.dialog.addEventListener('close', () => this.finish());
  }

  start() {
    if (this.active || this.completed) return;
    this.active = true;
    this.onStart();
    this.scrollStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    try {
      this.dialog.showModal();
      this.skipButton.focus({ preventScroll: true });
      this.video.currentTime = 0;
      this.play();
    } catch {
      // Unsupported dialog/media APIs should not strand the player behind a modal.
      this.finish('unavailable');
    }
  }

  async play() {
    if (!this.active) return;
    const attempt = ++this.playAttempt;
    this.playButton.hidden = true;
    this.status.textContent = 'Loading landing sequence...';
    try {
      await this.video.play();
    } catch (error) {
      // A late rejection from an earlier play must not override a retry or Skip.
      if (!this.active || attempt !== this.playAttempt) return;
      if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
        this.status.textContent = 'Press Play to start the landing sequence.';
        this.playButton.textContent = 'PLAY INTRO';
        this.playButton.hidden = false;
        this.playButton.focus({ preventScroll: true });
      } else {
        this.finish('unavailable');
      }
    }
  }

  finish(reason = 'complete') {
    if (!this.active) return;
    this.active = false;
    this.completed = true;
    this.playAttempt++;
    this.video.pause();
    if (this.dialog.open) this.dialog.close();
    document.body.style.overflow = this.scrollStyle;
    this.onFinish(reason);
  }
}
