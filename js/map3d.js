    upd() {
      const c = this.cam, e = this.povBlend;
      let ep = c.pitch;
      if (e > 0.001) {
        const cosv = clamp((this.curAlt + 16) / this.D, 0.02, 0.6);
        ep = lerp(c.pitch, Math.min(1.5, Math.acos(cosv) + this.pitchAng * 0.6), e);
      }
      const anchorPitch = ep;
      ep = clamp(ep + e * this.lookPitch, 0.08, 1.52);
      const heading = c.heading + e * this.lookYaw;
      this.ep = ep;
      this.ca = Math.cos(heading); this.sa = Math.sin(heading); this.cp = Math.cos(ep); this.sp = Math.sin(ep);

      const base = this.project(c.lat, c.lng, c.zoom);
      const followPlane = e > 0.06;
      const planeTarget = this.pathAt(this.progress);
      const planeProj = this.project(planeTarget.lat, planeTarget.lng, c.zoom);
      const off = e * this.D * Math.sin(anchorPitch);
      this.cz0 = followPlane ? planeProj : base;
      this.cz = followPlane
        ? { x: planeProj.x, y: planeProj.y }
        : { x: base.x + Math.sin(c.heading) * off, y: base.y - Math.cos(c.heading) * off };
      this.roll = e * clamp(this.bank * 0.9, -0.4, 0.4); this.cr = Math.cos(this.roll); this.sr = Math.sin(this.roll);
    }
