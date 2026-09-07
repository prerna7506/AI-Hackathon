import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  AfterViewInit,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectorRef,
  effect,
  untracked,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FirestoreService, TopicThreadData } from '../../services/firestore.service';
import { WorkflowService } from '../../services/ai-advisor.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

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

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text?: string;
  showChart?: boolean;
  isTyping?: boolean;
  attachmentName?: string;
  timestamp?: string;
}

interface TopicThread {
  id: string;
  title: string;
  subtext: string;
  messages: ChatMessage[];
  prompts: string[];
  pipelineId?: string;
}

@Component({
  selector: 'app-ai-advisor',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  templateUrl: './ai-advisor.html',
  styleUrl: './ai-advisor.scss'
})
export class AiAdvisorComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  @ViewChild('chatViewport') private chatViewport!: ElementRef;
  @ViewChild('messageTextarea') private messageTextarea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('chatBgCanvas') private chatBgCanvasRef?: ElementRef<HTMLCanvasElement>;
  private cdr = inject(ChangeDetectorRef);
  private aiService = inject(WorkflowService);
  private firestoreService = inject(FirestoreService);
  private route = inject(ActivatedRoute);
  authService = inject(AuthService);

  // 3D Background Canvas animation (Dimmer version of dashboard 3D scene)
  private chatBgAnimFrameId?: number;
  private chatMouseX = 0;
  private chatMouseY = 0;
  private targetChatMouseX = 0;
  private targetChatMouseY = 0;
  private chatTime = 0;
  private polyhedra: Polyhedron3D[] = [];
  private ambientNodes: AmbientNode3D[] = [];

  activeTopicId = 'chat-init';
  attachedFileName: string | null = null;
  attachedFile: File | null = null;
  newMessage = '';
  shouldScrollToBottom = false;
  isLoading = false;
  private activeTimer: any = null;
  private currentTypingMsgId: string | null = null;

  topics: TopicThread[] = [
    {
      id: 'chat-init',
      title: 'New Chat',
      subtext: 'Just started',
      prompts: [
        'Can I afford a car for ₹8 Lakh?',
        'Can I buy an iPhone for ₹1.5 Lakh?',
        'Can I afford a ₹50 Lakh home loan?',
        'Can I afford a ₹2 Lakh vacation?'
      ],
      messages: [
        {
          id: 'bot-start-init',
          sender: 'bot',
          text: 'Hello! I am your FinMate Financial Decision Advisor. Tell me about any purchase or financial decision you are planning, and I will help you answer: "Can I afford this?"',
          timestamp: 'Just now'
        }
      ]
    }
  ];

  get currentTopic(): TopicThread {
    return this.topics.find(t => t.id === this.activeTopicId) || this.topics[0];
  }

  get hasActiveTopic(): boolean {
    return this.topics.length > 0;
  }

  constructor() {
    effect(() => {
      const uid = this.authService.currentUserId();
      const isLoggedIn = this.authService.isLoggedIn();
      untracked(() => {
        if (isLoggedIn && uid) {
          this.loadChatsFromFirestore(uid);
        } else if (!isLoggedIn && !this.authService.isAuthChecking()) {
          this.topics = [this.createDefaultThread('chat-guest')];
          this.activeTopicId = 'chat-guest';
        }
      });
    });
  }

  ngOnInit(): void {
    const uid = this.authService.currentUserId();
    if (uid && this.authService.isLoggedIn()) {
      this.loadChatsFromFirestore(uid);
    }

    const pendingPrompt = this.route.snapshot.queryParamMap.get('prompt');
    const pendingPipelineId = this.route.snapshot.queryParamMap.get('pipelineId');

    if (pendingPrompt) {
      setTimeout(() => {
        this.startNewChat(true, pendingPipelineId || undefined);
        this.sendMessage(pendingPrompt, pendingPipelineId || undefined);
      }, 500);
    }
  }

  ngAfterViewInit(): void {
    this.initChat3DBackground();
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    const width = window.innerWidth || 1000;
    const height = window.innerHeight || 800;
    this.targetChatMouseX = (event.clientX - width / 2) / (width / 2);
    this.targetChatMouseY = (event.clientY - height / 2) / (height / 2);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  /* -------------------------------------------------------------
   * 3D Background Scene for Chat View: Dual Wave Canopies + 16 Polyhedra + Constellation
   * ------------------------------------------------------------ */
  private initChat3DBackground(): void {
    const canvas = this.chatBgCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || canvas.parentElement?.clientWidth || window.innerWidth;
      const h = rect.height || canvas.parentElement?.clientHeight || window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    // 1. Build 16 floating 3D polyhedra (Octahedrons & Isometric Cubes)
    this.polyhedra = [
      // Upper Area (Above the chat view & header)
      this.createOctahedron(-440, -310, 200, 44, 'rgba(16, 185, 129,', 0.007, 0.011),
      this.createCube(-240, -290, 250, 32, 'rgba(6, 182, 212,', -0.009, 0.008),
      this.createOctahedron(-30, -330, 210, 46, 'rgba(16, 185, 129,', 0.006, 0.013),
      this.createCube(230, -280, 260, 32, 'rgba(168, 85, 247,', 0.01, -0.007),
      this.createOctahedron(460, -300, 220, 42, 'rgba(6, 182, 212,', -0.008, 0.01),
      this.createOctahedron(-130, -170, 180, 32, 'rgba(16, 185, 129,', 0.009, -0.01),
      this.createCube(150, -160, 190, 28, 'rgba(6, 182, 212,', -0.007, 0.009),
      this.createOctahedron(350, -180, 220, 36, 'rgba(168, 85, 247,', 0.008, 0.007),

      // Mid & Lower Areas
      this.createOctahedron(-490, 50, 250, 38, 'rgba(6, 182, 212,', 0.007, 0.009),
      this.createCube(490, 70, 260, 32, 'rgba(16, 185, 129,', -0.008, -0.009),
      this.createOctahedron(-340, 230, 220, 36, 'rgba(168, 85, 247,', 0.008, -0.006),
      this.createCube(-130, 270, 240, 32, 'rgba(16, 185, 129,', -0.009, 0.011),
      this.createOctahedron(70, 280, 220, 42, 'rgba(6, 182, 212,', 0.007, 0.012),
      this.createCube(330, 230, 250, 30, 'rgba(16, 185, 129,', -0.008, -0.01),
      this.createOctahedron(-450, -70, 280, 34, 'rgba(6, 182, 212,', 0.006, 0.008),
      this.createCube(460, -80, 290, 28, 'rgba(168, 85, 247,', -0.007, 0.012)
    ];

    // 2. Build 42 floating 3D constellation nodes with energy connections
    this.ambientNodes = [];
    const nodeCount = 42;
    for (let i = 0; i < nodeCount; i++) {
      this.ambientNodes.push({
        x: (Math.random() - 0.5) * 1200,
        y: (Math.random() - 0.5) * 900,
        z: Math.random() * 320 + 50,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        vz: (Math.random() - 0.5) * 0.2,
        size: Math.random() * 2.2 + 1.2,
        color: i % 3 === 0 ? 'rgba(6, 182, 212,' : 'rgba(16, 185, 129,'
      });
    }

    const animate = () => {
      const dpr = window.devicePixelRatio || 1;
      const curW = canvas.width / dpr;
      const curH = canvas.height / dpr;

      ctx.clearRect(0, 0, curW, curH);

      const isLight = document.documentElement.getAttribute('data-theme') === 'light' || document.documentElement.classList.contains('light-theme');
      const strokePrimary = isLight ? 'rgba(5, 150, 105,' : 'rgba(16, 185, 129,';
      const strokeCyan = isLight ? 'rgba(8, 145, 178,' : 'rgba(6, 182, 212,';

      // Smooth mouse easing
      this.chatMouseX += (this.targetChatMouseX - this.chatMouseX) * 0.05;
      this.chatMouseY += (this.targetChatMouseY - this.chatMouseY) * 0.05;
      this.chatTime += 0.016;

      const centerX = curW / 2 + this.chatMouseX * 30;
      const centerY = curH * 0.46 + this.chatMouseY * 22;
      const fov = 420;

      // -----------------------------------------------------------
      // A. Draw Dual 3D Undulating Perspective Wave Meshes
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
            const wave = Math.sin(c * freqX + this.chatTime * speed) * Math.cos(r * freqZ + this.chatTime * (speed * 0.7)) * amp;
            const worldY = baseY + wave + r * stepY;

            const camX = x + this.chatMouseX * (z * 0.12);
            const camY = worldY + this.chatMouseY * (z * 0.08);

            const px = centerX + camX * scale;
            const py = centerY + camY * scale;

            const depthFactor = 1 - r / rows;
            const alpha = Math.max(0.025, depthFactor * (isLight ? 0.22 : 0.17));

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

            // Longitudinal line
            if (r < rows - 1) {
              const nextRow = pts[r + 1][c];
              ctx.strokeStyle = `${strokeCyan} ${pt.alpha * 0.9})`;
              ctx.lineWidth = 0.85;
              ctx.beginPath();
              ctx.moveTo(pt.px, pt.py);
              ctx.lineTo(nextRow.px, nextRow.py);
              ctx.stroke();
            }

            // Intersection nodes
            if (r % 2 === 0 && c % 2 === 0 && pt.alpha > 0.06) {
              ctx.fillStyle = `${strokePrimary} ${pt.alpha * 1.5})`;
              ctx.beginPath();
              ctx.arc(pt.px, pt.py, 1.8 * (fov / (fov + pt.pz)), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      };

      // Upper celestial wave mesh
      drawWaveMesh(9, 22, -curH * 0.38, 80, 42, 0.38, 0.42, 1.5, 24, 14);

      // Lower terrain liquidity wave mesh
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

        const parallaxX = n.x + this.chatMouseX * (350 / n.z) * 18;
        const parallaxY = n.y + this.chatMouseY * (350 / n.z) * 16;

        const scale = fov / (fov + n.z);
        const px = centerX + parallaxX * scale;
        const py = centerY + parallaxY * scale;

        const nodeColor = isLight ? (n.color.includes('6,') ? strokeCyan : strokePrimary) : n.color;
        projectedNodes.push({ px, py, pz: n.z, size: n.size * scale, color: nodeColor });

        const alpha = Math.max(0.1, (isLight ? 0.5 : 0.45) - n.z / 500);
        ctx.fillStyle = `${nodeColor} ${alpha})`;
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
            const alpha = (1 - dist / 115) * (isLight ? 0.18 : 0.14);
            ctx.strokeStyle = `${strokePrimary} ${alpha})`;
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

        const floatOffset = Math.sin(this.chatTime * 1.2 + poly.cz) * 16;
        const currentCy = poly.cy + floatOffset;

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

          const wx = poly.cx + x3 + this.chatMouseX * (poly.cz * 0.16);
          const wy = currentCy + y3 + this.chatMouseY * (poly.cz * 0.14);
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
            const faceAlpha = Math.min(isLight ? 0.25 : 0.22, Math.max(0.05, normalZ / 8000));
            const faceColor = isLight ? (face.color.includes('6,') ? strokeCyan : strokePrimary) : face.color;

            ctx.fillStyle = `${faceColor} ${faceAlpha})`;
            ctx.beginPath();
            ctx.moveTo(p0.px, p0.py);
            ctx.lineTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            ctx.closePath();
            ctx.fill();

            // Glowing edge
            ctx.strokeStyle = `${faceColor} ${faceAlpha + 0.15})`;
            ctx.lineWidth = 1.1;
            ctx.stroke();
          }
        }

        // Draw luminous vertex dots
        for (const pv of projectedVertices) {
          ctx.fillStyle = isLight ? 'rgba(5, 150, 105, 0.7)' : 'rgba(255, 255, 255, 0.65)';
          ctx.beginPath();
          ctx.arc(pv.px, pv.py, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      this.chatBgAnimFrameId = requestAnimationFrame(animate);
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
      { indices: [4, 5, 6], color },
      { indices: [4, 6, 7], color },
      { indices: [1, 0, 3], color },
      { indices: [1, 3, 2], color },
      { indices: [0, 1, 5], color },
      { indices: [0, 5, 4], color },
      { indices: [3, 7, 6], color },
      { indices: [3, 6, 2], color },
      { indices: [0, 4, 7], color },
      { indices: [0, 7, 3], color },
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

  private createDefaultThread(id: string = `chat-${Date.now()}`, pipelineId?: string): TopicThread {
    return {
      id: id,
      title: 'New Chat',
      subtext: 'Just started',
      pipelineId: pipelineId || '22014',
      prompts: [
        'Can I afford a car for ₹8 Lakh?',
        'Can I buy an iPhone for ₹1.5 Lakh?',
        'Can I afford a ₹50 Lakh home loan?',
        'Can I afford a ₹2 Lakh vacation?'
      ],
      messages: [
        {
          id: `bot-start-${id}`,
          sender: 'bot',
          text: 'Hello! I am your FinMate Financial Decision Advisor. Tell me about any purchase or financial decision you are planning, and I will help you answer: "Can I afford this?"',
          timestamp: this.getFormattedTime()
        }
      ]
    };
  }

  async loadChatsFromFirestore(uid: string): Promise<void> {
    try {
      const userChats = await this.firestoreService.loadUserChats(uid);
      if (userChats && userChats.length > 0) {
        this.topics = userChats;
        this.activeTopicId = this.topics[0].id;
      } else {
        const initial = this.createDefaultThread(`chat-${Date.now()}`);
        this.topics = [initial];
        this.activeTopicId = initial.id;
        this.firestoreService.saveChatThread(uid, initial);
      }
      this.shouldScrollToBottom = true;
      this.cdr.detectChanges();
    } catch (error) {
      console.warn('Failed to load user chats from Firestore:', error);
      if (this.topics.length === 0) {
        const fallback = this.createDefaultThread('chat-fallback');
        this.topics = [fallback];
        this.activeTopicId = fallback.id;
      }
      this.cdr.detectChanges();
    }
  }

  selectTopic(id: string): void {
    this.activeTopicId = id;
    this.shouldScrollToBottom = true;
  }

  editingTopicId: string | null = null;
  editingTitle: string = '';

  startRenaming(topic: TopicThread, event: MouseEvent): void {
    event.stopPropagation();
    this.editingTopicId = topic.id;
    this.editingTitle = topic.title;
  }

  saveRename(topic: TopicThread): void {
    const trimmed = this.editingTitle.trim();
    if (trimmed && trimmed !== topic.title) {
      topic.title = trimmed;
      const uid = this.authService.currentUserId();
      if (uid) {
        this.firestoreService.saveChatThread(uid, topic);
      }
    }
    this.editingTopicId = null;
    this.editingTitle = '';
    this.cdr.detectChanges();
  }

  cancelRename(): void {
    this.editingTopicId = null;
    this.editingTitle = '';
    this.cdr.detectChanges();
  }

  deleteTopic(topicId: string, event: MouseEvent): void {
    event.stopPropagation();

    const index = this.topics.findIndex(t => t.id === topicId);
    if (index === -1) return;

    this.topics = this.topics.filter(t => t.id !== topicId);

    // If deleted the active topic, switch to another or create a new one
    if (this.activeTopicId === topicId) {
      if (this.topics.length > 0) {
        this.activeTopicId = this.topics[0].id;
      } else {
        this.startNewChat(true);
      }
    }

    const uid = this.authService.currentUserId();
    if (uid) {
      this.firestoreService.deleteChatThread(uid, topicId);
    }

    this.cdr.detectChanges();
  }

  startNewChat(saveToFirestore: boolean = true, pipelineId?: string): void {
    const newTopic = this.createDefaultThread(`chat-${Date.now()}`, pipelineId);
    this.topics.unshift(newTopic);
    this.activeTopicId = newTopic.id;
    this.shouldScrollToBottom = true;

    const uid = this.authService.currentUserId();
    if (saveToFirestore && uid) {
      this.firestoreService.saveChatThread(uid, newTopic);
    }

    this.cdr.detectChanges();
  }

  usePrompt(prompt: string): void {
    this.sendMessage(prompt);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.attachedFile = input.files[0];
      this.attachedFileName = input.files[0].name;
    }
  }

  removeAttachment(): void {
    this.attachedFile = null;
    this.attachedFileName = null;
  }

  openSignInModal(): void {
    this.authService.openModal('auth');
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('hiddenFileInput') as HTMLInputElement;
    if (fileInput) fileInput.click();
  }

  adjustTextareaHeight(event?: Event): void {
    const textarea = event ? (event.target as HTMLTextAreaElement) : this.messageTextarea?.nativeElement;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(textarea.scrollHeight, 24)}px`;
    }
  }

  onTextareaKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  resetTextareaHeight(): void {
    if (this.messageTextarea?.nativeElement) {
      this.messageTextarea.nativeElement.style.height = 'auto';
    }
  }

  sendMessage(customText?: string, overridePipelineId?: string): void {
    const text = customText || this.newMessage.trim();
    if (!text && !this.attachedFileName) return;
    if (this.isLoading) return;

    // If no active topic, create a new one first
    if (!this.hasActiveTopic) {
      this.startNewChat(true, overridePipelineId);
    }

    const topic = this.currentTopic;
    if (overridePipelineId) {
      topic.pipelineId = overridePipelineId;
    }

    const attachment = this.attachedFileName;
    this.attachedFileName = null;
    this.attachedFile = null;

    // Auto-title new chats from first user message
    const isFirstUserMessage = !topic.messages.some(m => m.sender === 'user');
    if (isFirstUserMessage && text) {
      topic.title = text.length > 28 ? text.substring(0, 26) + '…' : text;
    }

    // Add user message
    topic.messages.push({
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text,
      attachmentName: attachment || undefined,
      timestamp: this.getFormattedTime()
    });

    if (!customText) {
      this.newMessage = '';
      this.resetTextareaHeight();
    }

    // Persist user message to Firestore
    const uid = this.authService.currentUserId();
    if (uid) {
      this.firestoreService.saveChatThread(uid, topic);
    }

    this.isLoading = true;
    this.shouldScrollToBottom = true;

    // Add bot typing indicator
    const typingMsgId = `typing-${Date.now()}`;
    topic.messages.push({
      id: typingMsgId,
      sender: 'bot',
      isTyping: true
    });

    this.currentTypingMsgId = typingMsgId;

    // Build conversational context so the AI remembers previous items
    const contextualPrompt = this.buildFullConversationContext(topic, text);

    const activePipeline = topic.pipelineId || overridePipelineId || '22014';

    // Submit the job with full conversational context, targeting the requested pipeline
    this.aiService.runWorkflowAndAwaitResult(contextualPrompt, '{{input_string_true_input}}', { pipelineId: activePipeline }).subscribe({
      next: (response) => {
        const replyText = this.extractReplyText(response);
        if (replyText) {
          this.finishBotReply(topic, typingMsgId, replyText, text);
        }
      },
      error: (err) => {
        console.error('Workflow API call failed:', err);
        this.finishBotReply(
          topic,
          typingMsgId,
          `Sorry, I couldn't reach FinMate right now (${err.message || 'network error'}). Please try again.`,
          text
        );
      }
    });
  }

  /**
   * Builds the conversation history transcript so the stateless workflow agent
   * remembers all parameters (item, cost, income, savings) across multiple turns.
   */
  private buildFullConversationContext(topic: TopicThread, latestText: string): string {
    const validMessages = topic.messages
      .filter(m => !m.isTyping && m.text && !m.id.startsWith('bot-start'));

    if (validMessages.length <= 1) {
      return latestText;
    }

    // Combine recent conversation turns
    const history = validMessages.map(m => {
      if (m.sender === 'user') {
        return `User: ${m.text}`;
      } else {
        const lines = (m.text || '')
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0 && !l.startsWith('|') && !l.startsWith('━') && !l.startsWith('---'));
        const lastQuestion = lines.filter(l => l.endsWith('?')).pop() || lines[lines.length - 1] || '';
        return `Advisor: ${lastQuestion}`;
      }
    }).join('\n');

    return history;
  }

  /**
   * Pull a human-readable reply out of the final result payload from Aava workflow.
   */
  private extractReplyText(response: any): string | null {
    if (!response) return 'No response received from the workflow.';
    if (typeof response === 'string') return response;

    const data = response.data ?? response;

    // Check data.result object first (final completed payload)
    if (data.result) {
      if (typeof data.result === 'string') return data.result;

      // Check data.result.response string
      if (typeof data.result.response === 'string') {
        try {
          const parsed = JSON.parse(data.result.response);
          if (typeof parsed === 'string') return parsed;
          if (parsed?.output && typeof parsed.output === 'string') return parsed.output;
          if (parsed?.result && typeof parsed.result === 'string') return parsed.result;
          if (parsed?.raw && typeof parsed.raw === 'string') return parsed.raw;

          // Check tasksOutputs array
          if (Array.isArray(parsed?.tasksOutputs) && parsed.tasksOutputs.length > 0) {
            for (let i = parsed.tasksOutputs.length - 1; i >= 0; i--) {
              const task = parsed.tasksOutputs[i];
              if (task?.raw && typeof task.raw === 'string') return task.raw;
              if (task?.output && typeof task.output === 'string') return task.output;
              if (task?.description && typeof task.description === 'string' && !task.description.startsWith('You are')) return task.description;
            }
          }

          // Check pipeLineAgents array
          if (Array.isArray(parsed?.pipeLineAgents)) {
            for (let i = parsed.pipeLineAgents.length - 1; i >= 0; i--) {
              const pa = parsed.pipeLineAgents[i];
              if (pa?.output && typeof pa.output === 'string') return pa.output;
              if (pa?.raw && typeof pa.raw === 'string') return pa.raw;
              if (pa?.agent?.output && typeof pa.agent.output === 'string') return pa.agent.output;
              if (pa?.agent?.raw && typeof pa.agent.raw === 'string') return pa.agent.raw;
              if (pa?.task?.output && typeof pa.task.output === 'string') return pa.task.output;
              if (pa?.task?.raw && typeof pa.task.raw === 'string') return pa.task.raw;
            }
          }
        } catch {
          return data.result.response;
        }
      }

      if (typeof data.result.text === 'string') return data.result.text;
      if (typeof data.result.message === 'string') return data.result.message;
      if (typeof data.result.content === 'string') return data.result.content;
    }

    // Check data.response / data.output directly
    if (typeof data.response === 'string') return data.response;
    if (typeof data.output === 'string') return data.output;
    if (typeof data.message === 'string' && data.status === 'COMPLETED') return data.message;
    if (typeof data.answer === 'string' && data.answer) return data.answer;

    // Block intermediate statuses
    const innerStatus = (data?.status ?? response?.data?.status ?? '').toString().toUpperCase().trim();
    if (['QUEUED', 'IN_PROGRESS', 'RUNNING', 'PENDING', 'STARTED', 'INITIALIZING', 'PROCESSING'].includes(innerStatus)) {
      return null;
    }

    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  private finishBotReply(topic: TopicThread, typingMsgId: string, botReplyText: string | null, originalQuery: string): void {
    topic.messages = topic.messages.filter(m => m.id !== typingMsgId);
    this.currentTypingMsgId = null;

    if (botReplyText) {
      topic.messages = [
        ...topic.messages,
        {
          id: `bot-reply-${Date.now()}`,
          sender: 'bot',
          text: botReplyText,
          timestamp: this.getFormattedTime()
        }
      ];
    }

    topic.subtext = originalQuery
      ? originalQuery.length > 22
        ? originalQuery.substring(0, 20) + '...'
        : originalQuery
      : 'Decision query';

    this.isLoading = false;
    this.shouldScrollToBottom = true;

    const uid = this.authService.currentUserId();
    if (uid) {
      this.firestoreService.saveChatThread(uid, topic);

      if (botReplyText) {
        const decision = this.firestoreService.parseDecisionFromBotResponse(botReplyText, originalQuery);
        if (decision) {
          this.firestoreService.saveFinancialDecision(uid, decision);
        }
      }
    }

    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  stopGeneration(): void {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }

    const topic = this.currentTopic;
    if (topic && this.currentTypingMsgId) {
      topic.messages = topic.messages.filter(m => m.id !== this.currentTypingMsgId);
      this.currentTypingMsgId = null;
    }

    if (topic) {
      topic.messages = [
        ...topic.messages,
        {
          id: `stopped-${Date.now()}`,
          sender: 'bot',
          text: 'You stopped the response.',
          timestamp: this.getFormattedTime()
        }
      ];

      const uid = this.authService.currentUserId();
      if (uid) {
        this.firestoreService.saveChatThread(uid, topic);
      }
    }

    this.isLoading = false;
    this.shouldScrollToBottom = true;
    this.cdr.detectChanges();
  }

  private scrollToBottom(): void {
    try {
      if (this.chatViewport?.nativeElement) {
        this.chatViewport.nativeElement.scrollTop = this.chatViewport.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.warn('Scroll error:', err);
    }
  }

  private getFormattedTime(): string {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  ngOnDestroy(): void {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
    }
    if (this.chatBgAnimFrameId) {
      cancelAnimationFrame(this.chatBgAnimFrameId);
    }
  }
}