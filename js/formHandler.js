/**
 * Form Handler Module
 * Manages Bento grid data inputs, dynamic repeatable blocks, chip-based skill tagging,
 * non-destructive sample data preview modal with 4-way close protection,
 * and localStorage auto-save/restore.
 */

let skillsList = ["JavaScript", "TypeScript", "React", "Node.js", "Python", "SQL", "Docker", "Git"];
let userResumeBackup = null;

// Built-in Sample Profile (Alexander Chen)
const SAMPLE_RESUME_DATA = {
  personal: {
    name: "Alexander Chen",
    targetRole: "Senior Full Stack Software Engineer",
    email: "alex.chen.dev@email.com",
    phone: "+1 (555) 382-9014",
    location: "San Francisco, CA",
    linkedin: "linkedin.com/in/alexchen-dev",
    portfolio: "github.com/alexchen | alexchen.io"
  },
  summary: "Results-driven Senior Full Stack Software Engineer with 7+ years of experience engineering high-scale distributed systems, enterprise React/TypeScript frontends, and cloud microservices. Proven architectural leader adept at driving resilient systems processing 120M+ daily events while slashing latency and infrastructure spend.",
  experience: [
    {
      title: "Staff Software Engineer",
      company: "Stripe",
      duration: "Mar 2021 – Present",
      location: "San Francisco, CA",
      rawDescription: "Led the re-architecture of the core payment event ingestion pipeline handling 120M+ daily events, reducing p99 latency by 42% and cloud compute costs by $380K annually.\nArchitected real-time telemetry SDK adopted by 85+ internal engineering teams, standardizing distributed tracing with OpenTelemetry and Go.\nMentored 8 junior and mid-level engineers, resulting in 4 promotions and establishing team-wide test-driven development (TDD) benchmarks.\nSpecced and shipped zero-downtime database migration tooling across 40+ PostgreSQL clusters with 99.999% availability."
    },
    {
      title: "Senior Software Engineer",
      company: "Datadog",
      duration: "Jun 2018 – Feb 2021",
      location: "New York, NY",
      rawDescription: "Optimized enterprise React visualization pipeline by 60%, resolving chronic browser memory leaks across live time-series dashboards.\nContainerized continuous integration/delivery (CI/CD) pipelines with Docker and Kubernetes, reducing automated build cycles from 28 minutes to 6 minutes.\nPartnered closely with product and security leadership to implement granular Role-Based Access Control (RBAC) across 15,000+ enterprise customer accounts."
    },
    {
      title: "Software Engineer",
      company: "Vanguard",
      duration: "Aug 2016 – May 2018",
      location: "Malvern, PA",
      rawDescription: "Modernized mission-critical legacy Java enterprise services into modular Node.js/TypeScript microservices, lifting client portal availability to 99.99%.\nImplemented standardized OAuth2 and OIDC authentication protocols for single sign-on across retail and institutional trading platforms."
    }
  ],
  education: [
    {
      degree: "B.S. in Computer Science",
      college: "University of California, Berkeley",
      year: "Aug 2012 – May 2016",
      cgpa: "3.92 GPA | Magna Cum Laude"
    }
  ],
  skills: [
    "TypeScript", "JavaScript", "Go", "Python", "React", "Next.js", "Node.js",
    "Tailwind CSS", "GraphQL", "PostgreSQL", "Redis", "Docker", "Kubernetes", "AWS", "CI/CD", "System Design"
  ],
  projects: [
    {
      name: "DistributedCache-Go",
      tech: "Go, Redis, Raft Consensus, Docker",
      desc: "Engineered high-performance distributed in-memory key-value store with raft consensus replication; achieved 95,000 ops/sec throughput under bench testing.",
      link: "github.com/alexchen/distcache"
    },
    {
      name: "NextFlow UI Engine",
      tech: "TypeScript, React 19, Web Workers",
      desc: "Open-source visual workflow builder with 2.4k GitHub stars, zero external runtime UI dependencies, and 60fps graph rendering for 5,000+ nodes.",
      link: "alexchen.io/projects/nextflow"
    }
  ],
  jobDescription: "We are seeking a Senior Full Stack Software Engineer to build scalable distributed systems and high-impact web applications. Requirements: 5+ years of experience with TypeScript, React, Go/Node.js, microservices architecture, PostgreSQL, Docker, AWS cloud infrastructure, CI/CD pipelines, and automated testing.",
  targetRole: "Senior Full Stack Software Engineer"
};

/**
 * Initialize Form Handler
 */
function initFormHandler() {
  setupSkillsChipInput();
  setupTemplateButtons();
  setupAutoSave();
  setupSampleDataModal();
  
  // Restore saved data or provide initial blocks
  const hasRestored = restoreFromLocalStorage();
  if (!hasRestored) {
    ensureInitialBlocks();
  }
}

/**
 * Repeatable Sections Logic (Experience, Education, Projects)
 */
function ensureInitialBlocks() {
  if (document.querySelectorAll("#experienceContainer .experience-card").length === 0) {
    addExperience();
  }
  if (document.querySelectorAll("#educationContainer .education-card").length === 0) {
    addEducation();
  }
  if (document.querySelectorAll("#projectsContainer .project-card").length === 0) {
    addProject();
  }
}

function addExperience(data = null) {
  const template = document.getElementById("experienceTemplate");
  if (!template) return;
  const clone = template.content.cloneNode(true);
  const container = document.getElementById("experienceContainer");

  if (data) {
    const card = clone.querySelector(".experience-card");
    card.querySelector(".job-title").value = data.title || "";
    card.querySelector(".company").value = data.company || "";
    card.querySelector(".duration").value = data.duration || "";
    card.querySelector(".location").value = data.location || "";
    card.querySelector(".raw-description").value = data.rawDescription || (Array.isArray(data.bullets) ? data.bullets.join("\n") : "");
  }

  container.appendChild(clone);
  updateRemoveButtons("experienceContainer");
  saveToLocalStorage();
}

function addEducation(data = null) {
  const template = document.getElementById("educationTemplate");
  if (!template) return;
  const clone = template.content.cloneNode(true);
  const container = document.getElementById("educationContainer");

  if (data) {
    const card = clone.querySelector(".education-card");
    card.querySelector(".degree").value = data.degree || "";
    card.querySelector(".college").value = data.college || "";
    card.querySelector(".year").value = data.year || "";
    card.querySelector(".cgpa").value = data.cgpa || "";
  }

  container.appendChild(clone);
  updateRemoveButtons("educationContainer");
  saveToLocalStorage();
}

function addProject(data = null) {
  const template = document.getElementById("projectTemplate");
  if (!template) return;
  const clone = template.content.cloneNode(true);
  const container = document.getElementById("projectsContainer");

  if (data) {
    const card = clone.querySelector(".project-card");
    card.querySelector(".project-name").value = data.name || "";
    card.querySelector(".tech-stack").value = data.tech || "";
    card.querySelector(".project-desc").value = data.desc || "";
    card.querySelector(".project-link").value = data.link || "";
  }

  container.appendChild(clone);
  updateRemoveButtons("projectsContainer");
  saveToLocalStorage();
}

function removeBlock(btn) {
  const card = btn.closest(".entry-card");
  if (!card) return;
  const container = card.parentElement;
  card.remove();
  updateRemoveButtons(container.id);
  saveToLocalStorage();
  window.triggerInstantPreview();
}

function updateRemoveButtons(containerId) {
  const blocks = document.querySelectorAll(`#${containerId} .entry-card`);
  blocks.forEach(block => {
    const removeBtn = block.querySelector(".remove-btn");
    if (removeBtn) {
      const isOnlyOne = blocks.length <= 1;
      removeBtn.disabled = isOnlyOne;
      removeBtn.style.opacity = isOnlyOne ? "0.25" : "1";
      removeBtn.style.cursor = isOnlyOne ? "not-allowed" : "pointer";
    }
  });
}

function setupTemplateButtons() {
  const addExpBtn = document.getElementById("addExpBtn");
  if (addExpBtn) addExpBtn.addEventListener("click", () => addExperience());

  const addEduBtn = document.getElementById("addEduBtn");
  if (addEduBtn) addEduBtn.addEventListener("click", () => addEducation());

  const addProjBtn = document.getElementById("addProjBtn");
  if (addProjBtn) addProjBtn.addEventListener("click", () => addProject());
}

/**
 * Tag-Style Skills Input
 */
function setupSkillsChipInput() {
  const input = document.getElementById("skillInput");
  const wrapper = document.getElementById("skillsWrapper");

  if (!input || !wrapper) return;

  renderSkillChips();

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = input.value.trim().replace(/^,+|,+$/g, "");
      if (val && !skillsList.includes(val)) {
        skillsList.push(val);
        input.value = "";
        renderSkillChips();
        saveToLocalStorage();
        window.triggerInstantPreview();
      }
    } else if (e.key === "Backspace" && input.value === "" && skillsList.length > 0) {
      skillsList.pop();
      renderSkillChips();
      saveToLocalStorage();
      window.triggerInstantPreview();
    }
  });

  // Suggestion tags quick add
  const suggestTags = document.querySelectorAll(".suggest-tag");
  suggestTags.forEach(tag => {
    tag.addEventListener("click", () => {
      const skillName = tag.dataset.skill || tag.textContent.trim();
      if (!skillsList.includes(skillName)) {
        skillsList.push(skillName);
        renderSkillChips();
        saveToLocalStorage();
        window.triggerInstantPreview();
      }
    });
  });
}

function renderSkillChips() {
  const container = document.getElementById("skillsChipsContainer");
  if (!container) return;
  container.innerHTML = "";

  skillsList.forEach((skill, index) => {
    const chip = document.createElement("span");
    chip.className = "skill-chip";
    chip.innerHTML = `
      <span>${escapeHtml(skill)}</span>
      <span class="remove-chip" onclick="removeSkill(${index})" title="Remove skill">&times;</span>
    `;
    container.appendChild(chip);
  });
}

function removeSkill(index) {
  skillsList.splice(index, 1);
  renderSkillChips();
  saveToLocalStorage();
  window.triggerInstantPreview();
}

function getSkillsArray() {
  return [...skillsList];
}

function setSkillsArray(newSkills) {
  skillsList = Array.isArray(newSkills) ? [...newSkills] : [];
  renderSkillChips();
  saveToLocalStorage();
}

/**
 * Data Collection Functions
 */
function collectPersonal() {
  return {
    name: document.getElementById("fullName")?.value.trim() || "",
    targetRole: document.getElementById("targetRole")?.value.trim() || "",
    email: document.getElementById("email")?.value.trim() || "",
    phone: document.getElementById("phone")?.value.trim() || "",
    location: document.getElementById("location")?.value.trim() || "",
    linkedin: document.getElementById("linkedin")?.value.trim() || "",
    portfolio: document.getElementById("portfolio")?.value.trim() || ""
  };
}

function collectExperience() {
  const cards = document.querySelectorAll("#experienceContainer .experience-card");
  return Array.from(cards).map(card => {
    const rawDesc = card.querySelector(".raw-description")?.value.trim() || "";
    return {
      title: card.querySelector(".job-title")?.value.trim() || "",
      company: card.querySelector(".company")?.value.trim() || "",
      duration: card.querySelector(".duration")?.value.trim() || "",
      location: card.querySelector(".location")?.value.trim() || "",
      rawDescription: rawDesc,
      bullets: rawDesc.split("\n").filter(Boolean).map(b => b.replace(/^[-*•]\s*/, ""))
    };
  }).filter(exp => exp.title || exp.company || exp.rawDescription);
}

function collectEducation() {
  const cards = document.querySelectorAll("#educationContainer .education-card");
  return Array.from(cards).map(card => ({
    degree: card.querySelector(".degree")?.value.trim() || "",
    college: card.querySelector(".college")?.value.trim() || "",
    year: card.querySelector(".year")?.value.trim() || "",
    cgpa: card.querySelector(".cgpa")?.value.trim() || ""
  })).filter(edu => edu.degree || edu.college);
}

function collectProjects() {
  const cards = document.querySelectorAll("#projectsContainer .project-card");
  return Array.from(cards).map(card => ({
    name: card.querySelector(".project-name")?.value.trim() || "",
    tech: card.querySelector(".tech-stack")?.value.trim() || "",
    desc: card.querySelector(".project-desc")?.value.trim() || "",
    link: card.querySelector(".project-link")?.value.trim() || ""
  })).filter(p => p.name || p.desc);
}

function getFullFormData() {
  return {
    personal: collectPersonal(),
    summary: document.getElementById("summary")?.value.trim() || "",
    experience: collectExperience(),
    education: collectEducation(),
    skills: getSkillsArray(),
    projects: collectProjects(),
    jobDescription: document.getElementById("jobDescription")?.value.trim() || "",
    targetRole: document.getElementById("targetRole")?.value.trim() || ""
  };
}

/**
 * Auto-Save to localStorage
 */
let saveDebounceTimer;
function saveToLocalStorage() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    const state = getFullFormData();
    localStorage.setItem("resumeData", JSON.stringify(state));
  }, 150);
}

function setupAutoSave() {
  const form = document.getElementById("bentoForm");
  if (!form) return;

  form.addEventListener("input", () => {
    saveToLocalStorage();
    window.triggerInstantPreview();
  });

  form.addEventListener("change", () => {
    saveToLocalStorage();
    window.triggerInstantPreview();
  });
}

/**
 * Populate Form Fields from a Data Object
 */
function populateFormData(saved) {
  if (!saved) return;

  // Personal info
  if (saved.personal) {
    if (document.getElementById("fullName")) document.getElementById("fullName").value = saved.personal.name || "";
    if (document.getElementById("targetRole")) document.getElementById("targetRole").value = saved.personal.targetRole || "";
    if (document.getElementById("email")) document.getElementById("email").value = saved.personal.email || "";
    if (document.getElementById("phone")) document.getElementById("phone").value = saved.personal.phone || "";
    if (document.getElementById("location")) document.getElementById("location").value = saved.personal.location || "";
    if (document.getElementById("linkedin")) document.getElementById("linkedin").value = saved.personal.linkedin || "";
    if (document.getElementById("portfolio")) document.getElementById("portfolio").value = saved.personal.portfolio || "";
  }

  // Summary
  if (document.getElementById("summary")) {
    document.getElementById("summary").value = saved.summary || "";
  }

  // Job Description
  if (document.getElementById("jobDescription")) {
    document.getElementById("jobDescription").value = saved.jobDescription || "";
  }

  // Skills
  if (Array.isArray(saved.skills) && saved.skills.length > 0) {
    skillsList = [...saved.skills];
    renderSkillChips();
  }

  // Work Experience
  const expContainer = document.getElementById("experienceContainer");
  if (expContainer) {
    expContainer.innerHTML = "";
    if (Array.isArray(saved.experience) && saved.experience.length > 0) {
      saved.experience.forEach(exp => addExperience(exp));
    } else {
      addExperience();
    }
  }

  // Education
  const eduContainer = document.getElementById("educationContainer");
  if (eduContainer) {
    eduContainer.innerHTML = "";
    if (Array.isArray(saved.education) && saved.education.length > 0) {
      saved.education.forEach(edu => addEducation(edu));
    } else {
      addEducation();
    }
  }

  // Projects
  const projContainer = document.getElementById("projectsContainer");
  if (projContainer) {
    projContainer.innerHTML = "";
    if (Array.isArray(saved.projects) && saved.projects.length > 0) {
      saved.projects.forEach(p => addProject(p));
    } else {
      addProject();
    }
  }
}

/**
 * Restore from localStorage
 */
function restoreFromLocalStorage() {
  const savedStr = localStorage.getItem("resumeData");
  if (!savedStr) return false;

  try {
    const saved = JSON.parse(savedStr);
    if (!saved) return false;
    populateFormData(saved);
    return true;
  } catch (err) {
    console.error("Failed to restore from localStorage:", err);
    return false;
  }
}

/**
 * FIX 1: Non-Destructive Sample Data Modal
 * Supports 4 close methods: (a) ✕ button, (b) Cancel button, (c) Backdrop click, (d) ESC key.
 * On ANY close/cancel -> restores the user's PREVIOUSLY EDITED resume.
 * Only overwrites resume when user clicks "Load Sample Data" (confirm).
 */
function setupSampleDataModal() {
  const modal = document.getElementById("sampleDataModal");
  const openBtn = document.getElementById("sampleDataBtn");
  const closeBtn = document.getElementById("closeSampleModalBtn");
  const cancelBtn = document.getElementById("cancelSampleModalBtn");
  const confirmBtn = document.getElementById("confirmSampleDataBtn");

  if (!modal) return;

  function openModal() {
    // 1. Take a safe backup snapshot of the user's actual edited resume
    userResumeBackup = window.getFullFormData();
    modal.classList.add("open");
  }

  function closeModalAndRestore() {
    modal.classList.remove("open");
    // Restore user's previous resume state so nothing is ever lost
    if (userResumeBackup) {
      populateFormData(userResumeBackup);
      saveToLocalStorage();
      window.triggerInstantPreview();
      userResumeBackup = null;
    }
  }

  function confirmLoadSample() {
    modal.classList.remove("open");
    // Overwrite with sample data only on explicit confirmation
    populateFormData(SAMPLE_RESUME_DATA);
    saveToLocalStorage();
    window.triggerInstantPreview();
    userResumeBackup = null;
    window.showToast("Sample data loaded! You can customize any field.", "info");
  }

  if (openBtn) openBtn.addEventListener("click", openModal);
  // (a) Top-right ✕ button
  if (closeBtn) closeBtn.addEventListener("click", closeModalAndRestore);
  // (b) Cancel button
  if (cancelBtn) cancelBtn.addEventListener("click", closeModalAndRestore);
  // (c) Backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModalAndRestore();
  });
  // (d) ESC key
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) {
      closeModalAndRestore();
    }
  });

  if (confirmBtn) confirmBtn.addEventListener("click", confirmLoadSample);
}

function clearAllData() {
  if (confirm("Are you sure you want to clear all resume fields?")) {
    localStorage.removeItem("resumeData");
    window.location.reload();
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Global Exports
window.initFormHandler = initFormHandler;
window.addExperience = addExperience;
window.addEducation = addEducation;
window.addProject = addProject;
window.removeBlock = removeBlock;
window.removeSkill = removeSkill;
window.getFullFormData = getFullFormData;
window.populateFormData = populateFormData;
window.getSkillsArray = getSkillsArray;
window.setSkillsArray = setSkillsArray;
window.clearAllData = clearAllData;
window.saveToLocalStorage = saveToLocalStorage;
window.escapeHtml = escapeHtml;
