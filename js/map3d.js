      canvas.addEventListener('pointermove', e => {
        const drag = this.lookPointer;
        if (!drag || drag.id !== e.pointerId || !this.flying) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY;
        if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3) drag.moved = true;
        if (!drag.moved) return;
        // Keep the world spinning around the plane, instead of forcing the cockpit POV.
        this.lookYaw = (this.lookYaw + dx * 0.008) % TAU;
        this.lookPitch = clamp(this.lookPitch + dy * 0.004, -1.2, 1.2);
        canvas.classList.add('look-dragging');
        e.preventDefault();
      });
      const endLook = e => {
        if (this.lookPointer && this.lookPointer.id === e.pointerId) {
          this.lookPointer = null;
          canvas.classList.remove('look-dragging');
        }
      };