/**
 * Neural-Inspired Particle Background
 * Adapted for Hydra — renders on the <main> element
 */

(function () {
  "use strict";

  // Global Configuration
  const CONFIG = {
    particleCount: 140,
    particleRadius: { min: 1, max: 2.5 },
    connectionDistance: 200,
    mouseInfluenceRadius: 200,
    mouseInfluenceStrength: 0.02,
    particleSpeed: { min: 0.1, max: 0.2 },
    colors: {
      particle: "rgba(74, 222, 128, 0.5)",
      connection: "rgba(74, 222, 128, 0.8)",
      mouseGlow: "rgba(74, 222, 128, 0.1)",
    },
    showMouseGlow: true,
    mouseGlowRadius: 120,
  };

  /**
   * Particle class for individual particles in the neural network
   */
  class Particle {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx =
        (Math.random() - 0.5) *
        (config.particleSpeed.max - config.particleSpeed.min);
      this.vy =
        (Math.random() - 0.5) *
        (config.particleSpeed.max - config.particleSpeed.min);
      this.radius =
        Math.random() *
          (config.particleRadius.max - config.particleRadius.min) +
        config.particleRadius.min;
    }

    update(mouse) {
      // Mouse influence — particles are gently attracted to cursor
      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.config.mouseInfluenceRadius) {
          const force =
            (this.config.mouseInfluenceRadius - distance) /
            this.config.mouseInfluenceRadius;
          const angle = Math.atan2(dy, dx);
          this.vx +=
            Math.cos(angle) * force * this.config.mouseInfluenceStrength;
          this.vy +=
            Math.sin(angle) * force * this.config.mouseInfluenceStrength;
        }
      }

      // Apply velocity with damping for smooth movement
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.99;
      this.vy *= 0.99;

      // Add slight random movement for organic feel
      this.vx += (Math.random() - 0.5) * 0.01;
      this.vy += (Math.random() - 0.5) * 0.01;

      // Wrap around boundaries
      if (this.x < 0) this.x = this.canvas.width;
      if (this.x > this.canvas.width) this.x = 0;
      if (this.y < 0) this.y = this.canvas.height;
      if (this.y > this.canvas.height) this.y = 0;
    }

    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.config.colors.particle;
      ctx.fill();
    }
  }

  /**
   * ParticleSystem class — manages a complete particle system for one element
   */
  class ParticleSystem {
    constructor(element, config = CONFIG) {
      this.element = element;
      this.config = config;
      this.canvas = null;
      this.ctx = null;
      this.particles = [];
      this.mouse = { x: null, y: null };
      this.animationId = null;
      this.isActive = true;
      this.isVisible = true;

      this.init();
    }

    init() {
      // Create canvas
      this.canvas = document.createElement("canvas");
      this.canvas.className = "neural-particles-canvas";
      this.canvas.setAttribute("aria-hidden", "true");
      this.canvas.style.cssText = `
				position: absolute;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				pointer-events: none;
				z-index: 0;
			`;

      // Ensure parent has relative positioning
      const currentPosition = window.getComputedStyle(this.element).position;
      if (currentPosition === "static" || !currentPosition) {
        this.element.style.position = "relative";
      }

      this.element.insertBefore(this.canvas, this.element.firstChild);
      this.ctx = this.canvas.getContext("2d");

      // Set canvas size
      this.resizeCanvas();

      // Create particles
      this.createParticles();

      // Mouse event listeners
      this.boundHandleMouseMove = this.handleMouseMove.bind(this);
      this.boundHandleMouseLeave = this.handleMouseLeave.bind(this);

      this.element.addEventListener("mousemove", this.boundHandleMouseMove, {
        passive: true,
      });
      this.element.addEventListener("mouseleave", this.boundHandleMouseLeave);

      // IntersectionObserver — pause when off-screen for performance
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            this.isVisible = entry.isIntersecting;
            if (this.isVisible && this.isActive) {
              this.animate();
            }
          });
        },
        { threshold: 0 },
      );
      this.observer.observe(this.element);

      // Start animation
      this.animate();
    }

    resizeCanvas() {
      if (!this.canvas) return;
      const rect = this.element.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }

    createParticles() {
      this.particles = [];
      for (let i = 0; i < this.config.particleCount; i++) {
        this.particles.push(new Particle(this.canvas, this.config));
      }
    }

    drawConnections() {
      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const dx = this.particles[i].x - this.particles[j].x;
          const dy = this.particles[i].y - this.particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < this.config.connectionDistance) {
            const opacity = 1 - distance / this.config.connectionDistance;
            this.ctx.beginPath();
            this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
            this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
            this.ctx.strokeStyle = `rgba(74, 222, 128, ${opacity * 0.15})`;
            this.ctx.lineWidth = 0.8;
            this.ctx.stroke();
          }
        }
      }
    }

    drawMouseGlow() {
      if (
        this.mouse.x === null ||
        this.mouse.y === null ||
        !this.config.showMouseGlow
      )
        return;

      const gradient = this.ctx.createRadialGradient(
        this.mouse.x,
        this.mouse.y,
        0,
        this.mouse.x,
        this.mouse.y,
        this.config.mouseGlowRadius,
      );
      gradient.addColorStop(0, this.config.colors.mouseGlow);
      gradient.addColorStop(1, "rgba(74, 222, 128, 0)");

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(
        this.mouse.x,
        this.mouse.y,
        this.config.mouseGlowRadius,
        0,
        Math.PI * 2,
      );
      this.ctx.fill();
    }

    animate() {
      if (!this.isActive || !this.ctx || !this.canvas) return;
      if (!this.isVisible) return;

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      this.drawMouseGlow();
      this.drawConnections();

      this.particles.forEach((particle) => {
        particle.update(this.mouse);
        particle.draw(this.ctx);
      });

      this.animationId = requestAnimationFrame(() => this.animate());
    }

    handleMouseMove(e) {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    }

    handleMouseLeave() {
      this.mouse.x = null;
      this.mouse.y = null;
    }

    handleResize() {
      this.resizeCanvas();
      this.createParticles();
    }

    destroy() {
      this.isActive = false;
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }
      if (this.observer) {
        this.observer.disconnect();
      }
      this.element.removeEventListener("mousemove", this.boundHandleMouseMove);
      this.element.removeEventListener(
        "mouseleave",
        this.boundHandleMouseLeave,
      );
      if (this.canvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
    }
  }

  // Store all particle systems
  const particleSystems = [];

  /**
   * Initialize particle systems for all .neural-particles elements
   */
  function init() {
    const targets = document.querySelectorAll(".neural-particles");

    targets.forEach((el) => {
      particleSystems.push(new ParticleSystem(el));
    });

    window.addEventListener(
      "resize",
      () => {
        particleSystems.forEach((system) => system.handleResize());
      },
      { passive: true },
    );
  }

  function cleanup() {
    particleSystems.forEach((system) => system.destroy());
    particleSystems.length = 0;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("beforeunload", cleanup);

  window.neuralParticlesConfig = CONFIG;
  window.neuralParticleSystems = particleSystems;
})();
