/**
 * Main Application Controller (app.js)
 * Coordinates Bento Grid UI interactions, AI generation workflows with 10s Undo,
 * sticky download dropdowns, multi-format export modals, and dark mode.
 */

let preAiUndoState = null;
let undoToastTimeout = null;

/**
 * Enhanced Toast Notifications with optional action button (e.g. Undo)
 */
function showToast(message, type = "info", action = null) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "info";
  if (type === "success") icon = "check_circle";
  if (type === "error") icon = "error";

  const contentDiv = document.createElement("div");
  contentDiv.style.display = "flex";
  contentDiv.style.alignItems = "center";
  contentDiv.style.gap = "0.6rem";
  contentDiv.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 18px;">${icon}</span>
    <span>${escapeHtml(message)}</span>
  `;
  toast.appendChild(contentDiv);

  // Optional interactive action buttons (like View Preview, Undo)
  const actions = Array.isArray(action) ? action : (action && action.label ? [action] : []);
  if (actions.length > 0) {
    const btnGroup = document.createElement("div");
    btnGroup.style.display = "flex";
    btnGroup.style.alignItems = "center";
    btnGroup.style.gap = "0.45rem";

    actions.forEach(act => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = act.secondary ? "toast-action-btn toast-action-btn-secondary" : "toast-action-btn";
      btn.textContent = act.label;
      btn.onclick = () => {
        act.onClick();
        if (act.dismiss !== false) toast.remove();
      };
      btnGroup.appendChild(btn);
    });
    toast.appendChild(btnGroup);
  }

  container.appendChild(toast);

  const duration = actions.length > 0 ? 10000 : 4000;
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

/**
 * Loading Skeleton / Spinner State
 */
function showLoadingSkeleton(isLoading, message = "Optimizing resume with ATS metrics...") {
  const overlay = document.getElementById("loadingOverlay");
  const text = document.getElementById("loadingText");
  const bentoGrid = document.querySelector(".bento-grid");

  if (text) text.textContent = message;
  
  if (isLoading) {
    if (overlay) overlay.classList.add("active");
    if (bentoGrid) bentoGrid.classList.add("is-optimizing");
  } else {
    if (overlay) overlay.classList.remove("active");
    if (bentoGrid) bentoGrid.classList.remove("is-optimizing");
  }
}

/**
 * Trigger Instant Live Preview
 */
function triggerInstantPreview() {
  if (typeof window.getFullFormData === "function" && typeof window.renderResume === "function") {
    const data = window.getFullFormData();
    window.renderResume(data);
  }
}

/**
 * FIX: "Generate ATS Resume" Master Flow with Undo Cache
 * After AI returns, merges results into a full data object, uses
 * populateFormData() to update EVERY form field, then re-renders the
 * live preview. This guarantees the user sees all changes immediately.
 */
async function handleAiGenerateResume() {
  const currentData = window.getFullFormData();
  const jdInput = document.getElementById("jobDescription");
  let jd = jdInput?.value.trim();
  const modelChoice = document.getElementById("modelSelector")?.value || "gemini";

  if (!jd) {
    const role = currentData.targetRole || currentData.personal?.targetRole || "Senior Software Engineer";
    jd = `Target Role: ${role}. Seeking a high-impact engineering professional with scalable systems, modern architecture, and automated testing experience.`;
    if (jdInput) jdInput.value = jd;
    showToast("Added target role template to Job Description.", "info");
  }

  // 1. Cache pre-AI state for Undo (deep clone)
  preAiUndoState = JSON.parse(JSON.stringify(currentData));

  showLoadingSkeleton(true, "Analyzing job description & rewriting with strong action verbs…");

  try {
    console.log("[AI] Starting optimization. Instruction:", jd.substring(0, 100));
    console.log("[AI] Current data:", JSON.stringify(currentData.personal));

    const res = await window.optimizeAtsResumeContent(currentData, jd, modelChoice);

    console.log("[AI] Raw result from optimizeAtsResumeContent:", res);

    if (!res || !res.success || !res.data) {
      throw new Error("AI optimizer did not return structured resume content.");
    }

    const enhanced = res.data;
    console.log("[AI] Enhanced data received:", JSON.stringify(enhanced.personal));
    console.log("[AI] Enhanced skills:", enhanced.skills?.slice(0, 3));

    // ── 2. Build merged data object ─────────────────────────────────────────
    const merged = JSON.parse(JSON.stringify(currentData));

    // 2a. Personal Details — only overwrite if AI gave a non-empty value
    if (enhanced.personal && typeof enhanced.personal === "object") {
      if (!merged.personal) merged.personal = {};

      // Name — use AI value if non-empty and different from placeholder
      const aiName = (enhanced.personal.name || "").trim();
      if (aiName && !aiName.startsWith("<") && aiName !== "YOUR NAME") {
        merged.personal.name = aiName;
        console.log("[AI] Updated name →", aiName);
      }

      const aiRole = (enhanced.personal.targetRole || "").trim();
      if (aiRole && !aiRole.startsWith("<") && aiRole !== "Target Job Title") {
        merged.personal.targetRole = aiRole;
        merged.targetRole = aiRole;
        console.log("[AI] Updated targetRole →", aiRole);
      }

      ["email", "phone", "location", "linkedin", "portfolio"].forEach(field => {
        const val = (enhanced.personal[field] || "").trim();
        if (val && !val.startsWith("<")) {
          merged.personal[field] = val;
        }
      });
    }

    // Also check root-level targetRole
    const rootRole = (enhanced.targetRole || "").trim();
    if (rootRole && !rootRole.startsWith("<") && rootRole !== "Target Job Title") {
      merged.targetRole = rootRole;
      if (!merged.personal) merged.personal = {};
      merged.personal.targetRole = rootRole;
    }

    // 2b. Summary
    const aiSummary = (enhanced.summary || "").trim();
    if (aiSummary && !aiSummary.startsWith("<")) {
      merged.summary = aiSummary;
    }

    // 2c. Experience
    if (Array.isArray(enhanced.experience) && enhanced.experience.length > 0) {
      enhanced.experience.forEach((aiExp, idx) => {
        if (!merged.experience[idx]) {
          merged.experience.push({
            title: aiExp.title || "",
            company: aiExp.company || "",
            duration: aiExp.duration || "",
            location: aiExp.location || "",
            rawDescription: Array.isArray(aiExp.bullets) ? aiExp.bullets.join("\n") : "",
            bullets: aiExp.bullets || []
          });
          return;
        }
        const bullets = Array.isArray(aiExp.bullets) ? aiExp.bullets.filter(Boolean) : [];
        if (aiExp.title && !aiExp.title.startsWith("<")) merged.experience[idx].title = aiExp.title;
        if (aiExp.company && !aiExp.company.startsWith("<")) merged.experience[idx].company = aiExp.company;
        if (aiExp.duration && !aiExp.duration.startsWith("<")) merged.experience[idx].duration = aiExp.duration;
        if (aiExp.location && !aiExp.location.startsWith("<")) merged.experience[idx].location = aiExp.location;
        if (bullets.length > 0) {
          merged.experience[idx].rawDescription = bullets.join("\n");
          merged.experience[idx].bullets = bullets;
        }
      });
    }

    // 2d. Education
    if (Array.isArray(enhanced.education) && enhanced.education.length > 0) {
      enhanced.education.forEach((aiEdu, idx) => {
        if (!merged.education[idx]) {
          merged.education.push(aiEdu);
          return;
        }
        if (aiEdu.degree && !aiEdu.degree.startsWith("<")) merged.education[idx].degree = aiEdu.degree;
        if (aiEdu.college && !aiEdu.college.startsWith("<")) merged.education[idx].college = aiEdu.college;
        if (aiEdu.year && !aiEdu.year.startsWith("<")) merged.education[idx].year = aiEdu.year;
        if (aiEdu.cgpa && !aiEdu.cgpa.startsWith("<")) merged.education[idx].cgpa = aiEdu.cgpa;
      });
    }

    // 2e. Skills
    if (Array.isArray(enhanced.skills) && enhanced.skills.length > 0) {
      const validSkills = enhanced.skills.filter(s => s && !s.startsWith("<"));
      if (validSkills.length > 0) {
        merged.skills = validSkills;
        console.log("[AI] Updated skills count →", validSkills.length);
      }
    }

    // 2f. Projects
    if (Array.isArray(enhanced.projects) && enhanced.projects.length > 0) {
      enhanced.projects.forEach((aiProj, idx) => {
        if (!merged.projects[idx]) {
          merged.projects.push(aiProj);
          return;
        }
        if (aiProj.name && !aiProj.name.startsWith("<")) merged.projects[idx].name = aiProj.name;
        if (aiProj.tech && !aiProj.tech.startsWith("<")) merged.projects[idx].tech = aiProj.tech;
        if (aiProj.desc && !aiProj.desc.startsWith("<")) merged.projects[idx].desc = aiProj.desc;
        if (aiProj.link && !aiProj.link.startsWith("<")) merged.projects[idx].link = aiProj.link;
      });
    }

    console.log("[AI] Final merged data personal:", JSON.stringify(merged.personal));
    console.log("[AI] Final merged skills count:", merged.skills?.length);

    // ── 3. Directly set form field values (bypass populateFormData race condition) ──
    // Write personal fields directly so they're guaranteed to appear
    if (merged.personal) {
      const fieldMap = {
        fullName:  merged.personal.name,
        targetRole: merged.personal.targetRole || merged.targetRole,
        email:     merged.personal.email,
        phone:     merged.personal.phone,
        location:  merged.personal.location,
        linkedin:  merged.personal.linkedin,
        portfolio: merged.personal.portfolio
      };
      Object.entries(fieldMap).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) {
          el.value = val;
        }
      });
    }

    // Write summary directly
    const summaryEl = document.getElementById("summary");
    if (summaryEl && merged.summary) summaryEl.value = merged.summary;

    // Use populateFormData for dynamic sections (experience, education, projects, skills)
    // Pass only the dynamic sections to avoid overwriting what we just set
    window.populateFormData({
      personal: merged.personal,
      summary: merged.summary,
      experience: merged.experience,
      education: merged.education,
      skills: merged.skills,
      projects: merged.projects
    });

    // ── 4. Flash highlight on all changed fields ────────────────────────────
    highlightAiUpdatedFields(enhanced);

    // ── 5. Re-render live preview ───────────────────────────────────────────
    window.renderResume(merged);

    // ── 6. Open the preview drawer automatically so user sees the result ───
    const previewDrawer = document.getElementById("previewDrawer");
    if (previewDrawer && !previewDrawer.classList.contains("open")) {
      previewDrawer.classList.add("open");
    }

    // ── 7. Persist to localStorage ─────────────────────────────────────────
    localStorage.setItem("resumeData", JSON.stringify(merged));
    if (typeof window.updateQuotaUI === "function") window.updateQuotaUI();

    showLoadingSkeleton(false);

    // Pulse Live Preview button
    const previewBtn = document.getElementById("togglePreviewDrawerBtn");
    if (previewBtn) {
      previewBtn.classList.add("ai-updated-field");
      setTimeout(() => previewBtn.classList.remove("ai-updated-field"), 3000);
    }

    // 8. Show success toast
    showToast(
      `✨ Resume updated with ${res.provider}! All fields & preview refreshed.`,
      "success",
      [
        {
          label: "Undo (10s)",
          onClick: () => handleUndoAiOptimization()
        }
      ]
    );

  } catch (err) {
    showLoadingSkeleton(false);
    console.error("[AI Generate] Failed:", err);
    showToast(`Optimization failed: ${err.message}`, "error");
  }
}


/**
 * Revert AI changes using the cached pre-AI state
 */
function handleUndoAiOptimization() {
  if (!preAiUndoState) return;
  window.populateFormData(preAiUndoState);
  window.renderResume(preAiUndoState);
  window.saveToLocalStorage();
  preAiUndoState = null;
  showToast("Reverted back to your original content.", "info");
}

/**
 * Flash a green glow on all form fields that the AI just changed.
 * Adds the CSS class "ai-updated-field" for 2.4 s, then removes it.
 */
function highlightAiUpdatedFields(enhanced) {
  function pulse(el) {
    if (!el) return;
    el.classList.add("ai-updated-field");
    setTimeout(() => el.classList.remove("ai-updated-field"), 2400);
  }

  if (enhanced.personal) {
    if (enhanced.personal.name) pulse(document.getElementById("fullName"));
    if (enhanced.personal.email) pulse(document.getElementById("email"));
    if (enhanced.personal.phone) pulse(document.getElementById("phone"));
    if (enhanced.personal.location) pulse(document.getElementById("location"));
    if (enhanced.personal.linkedin) pulse(document.getElementById("linkedin"));
    if (enhanced.personal.portfolio) pulse(document.getElementById("portfolio"));
    if (enhanced.personal.targetRole) pulse(document.getElementById("targetRole"));
  }

  if (enhanced.targetRole) pulse(document.getElementById("targetRole"));
  if (enhanced.summary) pulse(document.getElementById("summary"));

  if (Array.isArray(enhanced.experience)) {
    const cards = document.querySelectorAll("#experienceContainer .experience-card");
    enhanced.experience.forEach((_, idx) => {
      if (cards[idx]) pulse(cards[idx].querySelector(".raw-description"));
    });
  }

  if (Array.isArray(enhanced.education)) {
    const eduCards = document.querySelectorAll("#educationContainer .education-card");
    enhanced.education.forEach((_, idx) => {
      if (eduCards[idx]) {
        pulse(eduCards[idx].querySelector(".cgpa"));
        pulse(eduCards[idx].querySelector(".degree"));
      }
    });
  }

  if (Array.isArray(enhanced.skills) && enhanced.skills.length > 0) {
    pulse(document.getElementById("skillsWrapper"));
  }

  if (Array.isArray(enhanced.projects)) {
    const projCards = document.querySelectorAll("#projectsContainer .project-card");
    projCards.forEach(card => pulse(card));
  }
}

/**
 * FIX 3: Sticky Download Dropdown & Preview Modal Management
 */
function setupDownloadDropdown() {
  const triggerBtn = document.getElementById("downloadDropdownBtn");
  const menu = document.getElementById("downloadDropdownMenu");

  if (!triggerBtn || !menu) return;

  triggerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("show");
  });

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && e.target !== triggerBtn) {
      menu.classList.remove("show");
    }
  });

  // Action Buttons
  const optPdf = document.getElementById("optDownloadPdf");
  const optDocx = document.getElementById("optDownloadDocx");
  const optTxt = document.getElementById("optDownloadTxt");
  const optCopy = document.getElementById("optCopyPlain");

  if (optPdf) {
    optPdf.addEventListener("click", () => {
      menu.classList.remove("show");
      openDownloadPreviewModal("pdf");
    });
  }

  if (optDocx) {
    optDocx.addEventListener("click", () => {
      menu.classList.remove("show");
      openDownloadPreviewModal("docx");
    });
  }

  if (optTxt) {
    optTxt.addEventListener("click", () => {
      menu.classList.remove("show");
      openDownloadPreviewModal("txt");
    });
  }

  if (optCopy) {
    optCopy.addEventListener("click", () => {
      menu.classList.remove("show");
      window.copyAtsPlainText();
    });
  }
}

/**
 * Download Preview Modal before exporting
 */
let pendingDownloadFormat = "pdf";

function openDownloadPreviewModal(format) {
  pendingDownloadFormat = format;
  const modal = document.getElementById("downloadPreviewModal");
  const formatTitle = document.getElementById("downloadFormatTitle");
  const formatDesc = document.getElementById("downloadFormatDesc");
  const formatIcon = document.getElementById("downloadFormatIcon");

  if (!modal) return;

  if (format === "pdf") {
    if (formatTitle) formatTitle.textContent = "Download A4 PDF Document";
    if (formatDesc) formatDesc.textContent = "Your resume is scaled to fit a single A4 page.";
    if (formatIcon) formatIcon.textContent = "picture_as_pdf";
  } else if (format === "docx") {
    if (formatTitle) formatTitle.textContent = "Download Microsoft Word (.docx)";
    if (formatDesc) formatDesc.textContent = "Editable Word document formatted with standard linear headings, standard bullet lists, and ATS-safe font metrics.";
    if (formatIcon) formatIcon.textContent = "description";
  } else if (format === "txt") {
    if (formatTitle) formatTitle.textContent = "Download Plain Text (.txt)";
    if (formatDesc) formatDesc.textContent = "Clean ASCII/UTF-8 linear text file for manual copy-pasting or legacy enterprise ATS platforms.";
    if (formatIcon) formatIcon.textContent = "article";
  }

  modal.classList.add("open");
}

function closeDownloadPreviewModal() {
  const modal = document.getElementById("downloadPreviewModal");
  if (modal) modal.classList.remove("open");
}

function setupDownloadPreviewModal() {
  const modal = document.getElementById("downloadPreviewModal");
  const closeBtn = document.getElementById("closeDownloadModalBtn");
  const cancelBtn = document.getElementById("cancelDownloadModalBtn");
  const confirmBtn = document.getElementById("confirmDownloadBtn");

  if (!modal) return;

  if (closeBtn) closeBtn.addEventListener("click", closeDownloadPreviewModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeDownloadPreviewModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeDownloadPreviewModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) {
      closeDownloadPreviewModal();
    }
  });

  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      closeDownloadPreviewModal();
      if (pendingDownloadFormat === "pdf") {
        window.downloadAtsPdf();
      } else if (pendingDownloadFormat === "docx") {
        window.downloadDocx();
      } else if (pendingDownloadFormat === "txt") {
        window.downloadTxt();
      }
    });
  }
}

/**
 * Live Resume Sheet Drawer / Modal
 */
function setupPreviewDrawer() {
  const drawer = document.getElementById("previewDrawer");
  const openBtn = document.getElementById("togglePreviewDrawerBtn");
  const closeBtn = document.getElementById("closeDrawerBtn");

  if (!drawer) return;

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      drawer.classList.toggle("open");
      triggerInstantPreview();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      drawer.classList.remove("open");
    });
  }
}

/**
 * Dark Mode Management
 */
function initDarkMode() {
  const toggleBtn = document.getElementById("darkModeToggle");
  const savedTheme = localStorage.getItem("theme");

  // Editorial Swiss design is always light (paper canvas, ink typography)
  // Only honour an explicit "dark" preference if the user has set it
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    updateThemeIcon(true);
  } else {
    document.body.classList.remove("dark-mode");
    updateThemeIcon(false);
    // Persist "light" as the default so the icon is always correct
    if (!savedTheme) localStorage.setItem("theme", "light");
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const isDark = document.body.classList.toggle("dark-mode");
      localStorage.setItem("theme", isDark ? "dark" : "light");
      updateThemeIcon(isDark);
      showToast(isDark ? "Dark theme enabled" : "Light — Editorial view", "info");
    });
  }
}

function updateThemeIcon(isDark) {
  const icon = document.querySelector("#darkModeToggle .material-symbols-outlined");
  if (icon) {
    icon.textContent = isDark ? "light_mode" : "dark_mode";
  }
}

/**
 * Configure AI providers through the hosting platform, never in the browser.
 */
function initApiKeysModal() {
  const modal = document.getElementById("apiKeysModal");
  const openBtn = document.getElementById("openApiModalBtn");
  const closeBtn = document.getElementById("closeApiModalBtn");
  const cancelBtn = document.getElementById("cancelApiModalBtn");

  function openModal() {
    if (modal) modal.classList.add("open");
  }

  ["apiKey_anthropic", "apiKey_gemini", "apiKey_groq"].forEach(key => {
    localStorage.removeItem(key);
  });

  function closeModal() {
    if (modal) modal.classList.remove("open");
  }

  if (openBtn)    openBtn.addEventListener("click", openModal);
  if (closeBtn)   closeBtn.addEventListener("click", closeModal);
  if (cancelBtn)  cancelBtn.addEventListener("click", closeModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("open")) closeModal();
  });
}

/**
 * Initialize Everything on Page Load
 */
document.addEventListener("DOMContentLoaded", () => {
  // 1. Quota UI
  window.updateQuotaUI();

  // 2. Form & Storage
  window.initFormHandler();

  // 3. Instant Live Preview
  triggerInstantPreview();

  // 4. Modals & UI Controls
  initDarkMode();
  initApiKeysModal();
  setupDownloadDropdown();
  setupDownloadPreviewModal();
  setupPreviewDrawer();

  // 5. Generate ATS Button Action
  const generateAtsBtn = document.getElementById("generateAtsBtn");
  if (generateAtsBtn) generateAtsBtn.addEventListener("click", handleAiGenerateResume);

  const quickRenderBtn = document.getElementById("quickRenderBtn");
  if (quickRenderBtn) quickRenderBtn.addEventListener("click", () => {
    triggerInstantPreview();
    showToast("Live preview updated!", "success");
  });

  const clearDataBtn = document.getElementById("clearDataBtn");
  if (clearDataBtn) clearDataBtn.addEventListener("click", () => window.clearAllData());

  // 6. Font Pills
  document.querySelectorAll(".font-pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      window.setResumeFont(btn.dataset.font);
    });
  });

  // 7. Density Pills
  document.querySelectorAll(".density-pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      window.setResumeDensity(btn.dataset.density);
    });
  });

  // 8. Lucide Icons rendering if available
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
});

// Global Exports
window.showToast = showToast;
window.showLoadingSkeleton = showLoadingSkeleton;
window.triggerInstantPreview = triggerInstantPreview;
window.handleAiGenerateResume = handleAiGenerateResume;
window.handleUndoAiOptimization = handleUndoAiOptimization;
