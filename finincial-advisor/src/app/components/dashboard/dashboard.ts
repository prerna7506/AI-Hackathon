import {
  Component,
  inject,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface Vertex3D {
  x: number;
  y: number;
  z: number;
}

interface Face3D {
  indices: number[];
  color: string;
}

interface Polyhedron3D {
  cx: number;
  cy: number;
  cz: number;
  vx: number;
  vy: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  vRotX: number;
  vRotY: number;
  vRotZ: number;
  size: number;
  baseVertices: Vertex3D[];
  faces: Face3D[];
}

interface AmbientNode3D {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('bgMotionCanvas') private bgCanvasRef?: ElementRef<HTMLCanvasElement>;

  authService = inject(AuthService);

  // 3D Background Canvas Animation variables
  private bgAnimFrameId?: number;
  private mouseX = 0;
  private mouseY = 0;
  private targetMouseX = 0;
  private targetMouseY = 0;
  private time = 0;
  private polyhedra: Polyhedron3D[] = [];
  private ambientNodes: AmbientNode3D[] = [];

  get userName(): string {
    const profile = this.authService.userProfile();
    if (profile && profile.name) {
      return profile.name.split(' ')[0];
    }
    return 'Friend';
  }

  ngAfterViewInit(): void {
    this.init3DBackgroundScene();
  }

  ngOnDestroy(): void {
    if (this.bgAnimFrameId) {
      cancelAnimationFrame(this.bgAnimFrameId);
    }
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    const width = window.innerWidth || 1000;
    const height = window.innerHeight || 800;
    this.targetMouseX = (event.clientX - width / 2) / (width / 2);
    this.targetMouseY = (event.clientY - height / 2) / (height / 2);
  }

  /* -------------------------------------------------------------
   * 3D Background Scene: Dual Wave Canopies + High-Density Polyhedra & Constellation
   * ------------------------------------------------------------ */
  private init3DBackgroundScene(): void {
    const canvas = this.bgCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || window.innerWidth;
      const h = rect.height || window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    // 1. Build 16 floating 3D polyhedra (Octahedrons & Isometric Cubes)
    // Distributed richly in the upper space above the cards, middle, and sides
    this.polyhedra = [
      // Upper Area (Above the Cards & Header empty zones)
      this.createOctahedron(-460, -320, 200, 46, 'rgba(16, 185, 129,', 0.007, 0.011),
      this.createCube(-260, -300, 260, 32, 'rgba(6, 182, 212,', -0.009, 0.008),
      this.createOctahedron(-40, -340, 210, 48, 'rgba(16, 185, 129,', 0.006, 0.013),
      this.createCube(220, -290, 270, 34, 'rgba(168, 85, 247,', 0.01, -0.007),
      this.createOctahedron(480, -310, 230, 44, 'rgba(6, 182, 212,', -0.008, 0.01),
      this.createOctahedron(-140, -180, 180, 34, 'rgba(16, 185, 129,', 0.009, -0.01),
      this.createCube(140, -170, 190, 28, 'rgba(6, 182, 212,', -0.007, 0.009),
      this.createOctahedron(360, -190, 220, 38, 'rgba(168, 85, 247,', 0.008, 0.007),

      // Mid & Lower Areas
      this.createOctahedron(-520, 40, 250, 40, 'rgba(6, 182, 212,', 0.007, 0.009),
      this.createCube(520, 60, 260, 34, 'rgba(16, 185, 129,', -0.008, -0.009),
      this.createOctahedron(-360, 220, 220, 38, 'rgba(168, 85, 247,', 0.008, -0.006),
      this.createCube(-140, 280, 240, 34, 'rgba(16, 185, 129,', -0.009, 0.011),
      this.createOctahedron(60, 290, 220, 44, 'rgba(6, 182, 212,', 0.007, 0.012),
      this.createCube(340, 240, 250, 32, 'rgba(16, 185, 129,', -0.008, -0.01),
      this.createOctahedron(-480, -80, 280, 36, 'rgba(6, 182, 212,', 0.006, 0.008),
      this.createCube(490, -90, 290, 30, 'rgba(168, 85, 247,', -0.007, 0.012)
    ];

    // 2. Build 42 floating 3D constellation nodes with energy connections
    this.ambientNodes = [];
    const nodeCount = 42;
    for (let i = 0; i < nodeCount; i++) {
      this.ambientNodes.push({
        x: (Math.random() - 0.5) * 1200,
        y: (Math.random() - 0.5) * 900,
        z: Math.random() * 320 + 50,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        vz: (Math.random() - 0.5) * 0.25,
        size: Math.random() * 2.2 + 1.2,
        color: i % 3 === 0 ? 'rgba(6, 182, 212,' : 'rgba(16, 185, 129,'
      });
    }

    const animate = () => {
      const dpr = window.devicePixelRatio || 1;
      const curW = canvas.width / dpr;
      const curH = canvas.height / dpr;

      ctx.clearRect(0, 0, curW, curH);

      // Smooth mouse easing
      this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
      this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;
      this.time += 0.016;

      const isLight = document.documentElement.getAttribute('data-theme') === 'light' || document.documentElement.classList.contains('light-theme');
      const strokePrimary = isLight ? 'rgba(5, 150, 105,' : 'rgba(16, 185, 129,';
      const strokeCyan = isLight ? 'rgba(8, 145, 178,' : 'rgba(6, 182, 212,';

      const centerX = curW / 2 + this.mouseX * 35;
      const centerY = curH * 0.46 + this.mouseY * 25;
      const fov = 420;

      // -----------------------------------------------------------
      // A. Draw Dual 3D Undulating Perspective Wave Meshes
      // 1. Upper Canopy Wave (Fills empty area above cards & header)
      // 2. Lower Terrain Wave (Fills lower dashboard behind capabilities)
      // -----------------------------------------------------------
      const drawWaveMesh = (
        rows: number,
        cols: number,
        baseY: number,
        startZ: number,
        spacingZ: number,
        freqX: number,
        freqZ: number,
        speed: number,
        amp: number,
        stepY: number
      ) => {
        const gridSpacingX = (curW * 1.7) / cols;
        const startX = -curW * 0.85;

        const pts: { px: number; py: number; pz: number; alpha: number }[][] = [];

        for (let r = 0; r < rows; r++) {
          pts[r] = [];
          const z = startZ + r * spacingZ;
          const scale = fov / (fov + z);

          for (let c = 0; c < cols; c++) {
            const x = startX + c * gridSpacingX;
            const wave = Math.sin(c * freqX + this.time * speed) * Math.cos(r * freqZ + this.time * (speed * 0.7)) * amp;
            const worldY = baseY + wave + r * stepY;

            const camX = x + this.mouseX * (z * 0.12);
            const camY = worldY + this.mouseY * (z * 0.08);

            const px = centerX + camX * scale;
            const py = centerY + camY * scale;

            const depthFactor = 1 - r / rows;
            const alpha = Math.max(0.025, depthFactor * (isLight ? 0.22 : 0.18));

            pts[r][c] = { px, py, pz: z, alpha };
          }
        }

        // Draw grid connections
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const pt = pts[r][c];

            // Horizontal line
            if (c < cols - 1) {
              const nextCol = pts[r][c + 1];
              ctx.strokeStyle = `${strokePrimary} ${pt.alpha})`;
              ctx.lineWidth = 0.85;
              ctx.beginPath();
              ctx.moveTo(pt.px, pt.py);
              ctx.lineTo(nextCol.px, nextCol.py);
              ctx.stroke();
            }

            // Receding perspective depth line
            if (r < rows - 1) {
              const nextRow = pts[r + 1][c];
              ctx.strokeStyle = `${strokeCyan} ${pt.alpha * 0.9})`;
              ctx.lineWidth = 0.85;
              ctx.beginPath();
              ctx.moveTo(pt.px, pt.py);
              ctx.lineTo(nextRow.px, nextRow.py);
              ctx.stroke();
            }

            // Glowing intersection nodes
            if (r % 2 === 0 && c % 2 === 0 && pt.alpha > 0.06) {
              ctx.fillStyle = `${strokePrimary} ${pt.alpha * 1.5})`;
              ctx.beginPath();
              ctx.arc(pt.px, pt.py, 1.8 * (fov / (fov + pt.pz)), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      };

      // 1. Upper Celestial Wave Mesh (active right above cards and behind the header)
      drawWaveMesh(9, 22, -curH * 0.38, 80, 42, 0.38, 0.42, 1.5, 24, 14);

      // 2. Lower Terrain Liquidity Wave Mesh
      drawWaveMesh(12, 22, curH * 0.28, 80, 48, 0.35, 0.38, 1.7, 30, 20);

      // -----------------------------------------------------------
      // B. Draw 42 Ambient 3D Constellation Nodes with Energy Lines
      // -----------------------------------------------------------
      const projectedNodes: { px: number; py: number; pz: number; size: number; color: string }[] = [];

      for (const n of this.ambientNodes) {
        n.x += n.vx;
        n.y += n.vy;
        n.z += n.vz;

        if (n.x < -curW * 0.7) n.x = curW * 0.7;
        if (n.x > curW * 0.7) n.x = -curW * 0.7;
        if (n.y < -curH * 0.6) n.y = curH * 0.6;
        if (n.y > curH * 0.6) n.y = -curH * 0.6;
        if (n.z < 40) n.z = 340;
        if (n.z > 350) n.z = 50;

        const parallaxX = n.x + this.mouseX * (350 / n.z) * 20;
        const parallaxY = n.y + this.mouseY * (350 / n.z) * 18;

        const scale = fov / (fov + n.z);
        const px = centerX + parallaxX * scale;
        const py = centerY + parallaxY * scale;

        projectedNodes.push({ px, py, pz: n.z, size: n.size * scale, color: n.color });

        // Draw node
        const alpha = Math.max(0.08, 0.45 - n.z / 500);
        ctx.fillStyle = `${n.color} ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, n.size * scale, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw faint interconnects between nearby ambient nodes
      for (let i = 0; i < projectedNodes.length; i++) {
        for (let j = i + 1; j < projectedNodes.length; j++) {
          const dx = projectedNodes[i].px - projectedNodes[j].px;
          const dy = projectedNodes[i].py - projectedNodes[j].py;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 115) {
            const alpha = (1 - dist / 115) * 0.14;
            ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(projectedNodes[i].px, projectedNodes[i].py);
            ctx.lineTo(projectedNodes[j].px, projectedNodes[j].py);
            ctx.stroke();
          }
        }
      }

      // -----------------------------------------------------------
      // C. Render 16 Floating 3D Crystalline Polyhedra (Octahedrons & Cubes)
      // -----------------------------------------------------------
      for (const poly of this.polyhedra) {
        poly.rotX += poly.vRotX;
        poly.rotY += poly.vRotY;
        poly.rotZ += poly.vRotZ;

        // Gentle floating bob
        const floatOffset = Math.sin(this.time * 1.2 + poly.cz) * 16;
        const currentCy = poly.cy + floatOffset;

        // Rotate & project vertices
        const projectedVertices: { px: number; py: number; pz: number }[] = [];

        for (const v of poly.baseVertices) {
          let x = v.x * poly.size;
          let y = v.y * poly.size;
          let z = v.z * poly.size;

          // Rot X
          const y1 = y * Math.cos(poly.rotX) - z * Math.sin(poly.rotX);
          const z1 = y * Math.sin(poly.rotX) + z * Math.cos(poly.rotX);

          // Rot Y
          const x2 = x * Math.cos(poly.rotY) + z1 * Math.sin(poly.rotY);
          const z2 = -x * Math.sin(poly.rotY) + z1 * Math.cos(poly.rotY);

          // Rot Z
          const x3 = x2 * Math.cos(poly.rotZ) - y1 * Math.sin(poly.rotZ);
          const y3 = x2 * Math.sin(poly.rotZ) + y1 * Math.cos(poly.rotZ);

          // World position with mouse parallax
          const wx = poly.cx + x3 + this.mouseX * (poly.cz * 0.16);
          const wy = currentCy + y3 + this.mouseY * (poly.cz * 0.14);
          const wz = poly.cz + z2;

          const scale = fov / (fov + wz);
          const px = centerX + wx * scale;
          const py = centerY + wy * scale;

          projectedVertices.push({ px, py, pz: wz });
        }

        // Render translucent shaded faces
        for (const face of poly.faces) {
          const p0 = projectedVertices[face.indices[0]];
          const p1 = projectedVertices[face.indices[1]];
          const p2 = projectedVertices[face.indices[2]];

          const normalZ = (p1.px - p0.px) * (p2.py - p0.py) - (p1.py - p0.py) * (p2.px - p0.px);

          if (normalZ > 0) {
            // Face facing viewer
            const faceAlpha = Math.min(0.24, Math.max(0.06, normalZ / 8000));
            ctx.fillStyle = `${face.color} ${faceAlpha})`;
            ctx.beginPath();
            ctx.moveTo(p0.px, p0.py);
            ctx.lineTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            ctx.closePath();
            ctx.fill();

            // Glowing edge
            ctx.strokeStyle = `${face.color} ${faceAlpha + 0.16})`;
            ctx.lineWidth = 1.1;
            ctx.stroke();
          }
        }

        // Draw luminous vertex dots
        for (const pv of projectedVertices) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.beginPath();
          ctx.arc(pv.px, pv.py, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      this.bgAnimFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  private createOctahedron(
    cx: number,
    cy: number,
    cz: number,
    size: number,
    color: string,
    vRotX: number,
    vRotY: number
  ): Polyhedron3D {
    const baseVertices: Vertex3D[] = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 }
    ];

    const faces: Face3D[] = [
      { indices: [0, 2, 4], color },
      { indices: [2, 1, 4], color },
      { indices: [1, 3, 4], color },
      { indices: [3, 0, 4], color },
      { indices: [2, 0, 5], color },
      { indices: [1, 2, 5], color },
      { indices: [3, 1, 5], color },
      { indices: [0, 3, 5], color }
    ];

    return {
      cx,
      cy,
      cz,
      vx: 0,
      vy: 0,
      rotX: Math.random() * Math.PI,
      rotY: Math.random() * Math.PI,
      rotZ: Math.random() * Math.PI,
      vRotX,
      vRotY,
      vRotZ: (vRotX + vRotY) * 0.5,
      size,
      baseVertices,
      faces
    };
  }

  private createCube(
    cx: number,
    cy: number,
    cz: number,
    size: number,
    color: string,
    vRotX: number,
    vRotY: number
  ): Polyhedron3D {
    const baseVertices: Vertex3D[] = [
      { x: -1, y: -1, z: -1 },
      { x: 1, y: -1, z: -1 },
      { x: 1, y: 1, z: -1 },
      { x: -1, y: 1, z: -1 },
      { x: -1, y: -1, z: 1 },
      { x: 1, y: -1, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: -1, y: 1, z: 1 }
    ];

    const faces: Face3D[] = [
      // Front
      { indices: [4, 5, 6], color },
      { indices: [4, 6, 7], color },
      // Back
      { indices: [1, 0, 3], color },
      { indices: [1, 3, 2], color },
      // Top
      { indices: [0, 1, 5], color },
      { indices: [0, 5, 4], color },
      // Bottom
      { indices: [3, 7, 6], color },
      { indices: [3, 6, 2], color },
      // Left
      { indices: [0, 4, 7], color },
      { indices: [0, 7, 3], color },
      // Right
      { indices: [1, 2, 6], color },
      { indices: [1, 6, 5], color }
    ];

    return {
      cx,
      cy,
      cz,
      vx: 0,
      vy: 0,
      rotX: Math.random() * Math.PI,
      rotY: Math.random() * Math.PI,
      rotZ: Math.random() * Math.PI,
      vRotX,
      vRotY,
      vRotZ: (vRotX + vRotY) * 0.5,
      size,
      baseVertices,
      faces
    };
  }

  /* -------------------------------------------------------------
   * 3D Perspective Card Tilt Physics on Mouse Move
   * ------------------------------------------------------------ */
  onCardMouseMove(e: MouseEvent, cardEl: HTMLElement): void {
    const rect = cardEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -7;
    const rotateY = ((x - centerX) / centerX) * 7;

    cardEl.style.transform = `perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
  }

  onCardMouseLeave(cardEl: HTMLElement): void {
    cardEl.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0px)';
  }
}
