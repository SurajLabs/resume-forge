/**
 * ATS Resume Renderer Module
 * Generates ATS-optimized single-column HTML based on Stitch MCP "Executive Ledger" blueprint.
 * Handles Multi-Format Download Options (PDF, DOCX, TXT, Copy Plain Text),
 * and JetBrains Mono ATS Score gauge calculation.
 */

let currentFont = "'Inter', Arial, sans-serif";
let currentDensity = "standard";

/**
 * Render the Resume Sheet from data object
 * @param {Object} data - Clean resume data object
 */
function renderResume(data) {
  const sheet = document.getElementById("resume-sheet");
  if (!sheet) return;

  const personal = data.personal || {};
  const summary = data.summary || "";
  const experiences = data.experience || [];
  const education = data.education || [];
  const skills = data.skills || [];
  const projects = data.projects || [];
  const targetRole = data.targetRole || personal.targetRole || "";

  // Contact line assembly (pipe separated, clean ATS linear string)
  const contactParts = [];
  if (personal.email) {
    contactParts.push(`<a href="mailto:${escapeHtml(personal.email)}">${escapeHtml(personal.email)}</a>`);
  }
  if (personal.phone) {
    contactParts.push(`<span>${escapeHtml(personal.phone)}</span>`);
  }
  if (personal.location) {
    contactParts.push(`<span>${escapeHtml(personal.location)}</span>`);
  }
  if (personal.linkedin) {
    const cleanLinkedin = personal.linkedin.replace(/^https?:\/\//, "");
    contactParts.push(`<a href="https://${cleanLinkedin}" target="_blank" rel="noopener">${escapeHtml(cleanLinkedin)}</a>`);
  }
  if (personal.portfolio) {
    const cleanPortfolio = personal.portfolio.replace(/^https?:\/\//, "");
    contactParts.push(`<a href="https://${cleanPortfolio}" target="_blank" rel="noopener">${escapeHtml(cleanPortfolio)}</a>`);
  }

  const contactHtml = contactParts.join(`<span class="resume-sep mx-2">|</span>`);

  let html = `
    <!-- Header: Single-Column ATS Anchor -->
    <header class="resume-header">
      <h1 class="resume-name">${escapeHtml(personal.name || "YOUR NAME")}</h1>
      ${targetRole ? `<div class="resume-target-title">${escapeHtml(targetRole)}</div>` : ""}
      ${contactHtml ? `<div class="resume-contact-line">${contactHtml}</div>` : ""}
    </header>
  `;

  // Professional Summary
  if (summary) {
    html += `
      <section class="resume-section">
        <h2 class="resume-section-header">Professional Summary</h2>
        <p class="resume-summary-text">${escapeHtml(summary)}</p>
      </section>
    `;
  }

  // Work Experience
  if (experiences.length > 0) {
    html += `
      <section class="resume-section">
        <h2 class="resume-section-header">Work Experience</h2>
    `;

    experiences.forEach(exp => {
      let bullets = [];
      if (Array.isArray(exp.bullets) && exp.bullets.length > 0) {
        bullets = exp.bullets;
      } else if (exp.rawDescription) {
        bullets = exp.rawDescription
          .split("\n")
          .map(b => b.trim().replace(/^[-*•]\s*/, ""))
          .filter(b => b.length > 0);
      }

      html += `
        <article class="resume-entry">
          <div class="entry-header-row">
            <h3 class="entry-role-title">${escapeHtml(exp.title || "Job Title")}</h3>
            <span class="entry-meta-date">${escapeHtml(exp.duration || "")}</span>
          </div>
          <div class="entry-sub-row">
            <span class="entry-company-name">${escapeHtml(exp.company || "Company")}</span>
            <span class="entry-location">${escapeHtml(exp.location || "")}</span>
          </div>
          ${bullets.length > 0 ? `
            <ul class="resume-bullets">
              ${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}
            </ul>
          ` : ""}
        </article>
      `;
    });

    html += `</section>`;
  }

  // Key Projects
  if (projects.length > 0) {
    html += `
      <section class="resume-section">
        <h2 class="resume-section-header">Key Projects</h2>
    `;

    projects.forEach(proj => {
      let bullets = [];
      if (proj.desc) {
        bullets = proj.desc.split("\n").map(b => b.trim().replace(/^[-*•]\s*/, "")).filter(Boolean);
      }

      html += `
        <article class="resume-entry">
          <div class="project-header-row">
            <div class="project-title-group">
              <h3 class="project-name">${escapeHtml(proj.name || "Project")}</h3>
              ${proj.tech ? `<span class="project-tech">| ${escapeHtml(proj.tech)}</span>` : ""}
            </div>
            ${proj.link ? `<a class="project-link" href="https://${proj.link.replace(/^https?:\/\//, "")}" target="_blank" rel="noopener">${escapeHtml(proj.link)}</a>` : ""}
          </div>
          ${bullets.length > 0 ? `
            <ul class="resume-bullets" style="margin-top: 0.25rem;">
              ${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}
            </ul>
          ` : ""}
        </article>
      `;
    });

    html += `</section>`;
  }

  // Education
  if (education.length > 0) {
    html += `
      <section class="resume-section">
        <h2 class="resume-section-header">Education</h2>
    `;

    education.forEach(edu => {
      html += `
        <article class="resume-entry">
          <div class="entry-header-row">
            <h3 class="entry-role-title">${escapeHtml(edu.college || "University / College")}</h3>
            <span class="entry-meta-date">${escapeHtml(edu.year || "")}</span>
          </div>
          <div class="entry-sub-row">
            <span class="entry-company-name">${escapeHtml(edu.degree || "Degree")}</span>
            <span class="entry-location">${escapeHtml(edu.cgpa || "")}</span>
          </div>
        </article>
      `;
    });

    html += `</section>`;
  }

  // Technical Skills (Standard ATS layout)
  if (skills.length > 0) {
    html += `
      <section class="resume-section">
        <h2 class="resume-section-header">Technical Skills</h2>
        <div class="resume-skills-block">
          <div><span class="skill-category-label">Core Competencies:</span> ${skills.map(s => escapeHtml(s)).join(", ")}</div>
        </div>
      </section>
    `;
  }

  sheet.innerHTML = html;
  applyStylingPreferences();
  calculateAtsScore(data);
}

/**
 * Apply selected font and density settings to the sheet
 */
function applyStylingPreferences() {
  const sheet = document.getElementById("resume-sheet");
  if (!sheet) return;

  sheet.style.fontFamily = currentFont;
  sheet.className = currentDensity === "compact" ? "density-compact" : "";
}

function setResumeFont(fontName) {
  if (fontName === "Arial") {
    currentFont = "Arial, Helvetica, sans-serif";
  } else if (fontName === "Calibri") {
    currentFont = "Calibri, Candara, Segoe, Segoe UI, Arial, sans-serif";
  } else {
    currentFont = "'Inter', Arial, sans-serif";
  }

  document.querySelectorAll(".font-pill-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.font === fontName);
  });

  applyStylingPreferences();
}

function setResumeDensity(density) {
  currentDensity = density;

  document.querySelectorAll(".density-pill-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.density === density);
  });

  applyStylingPreferences();
}

/**
 * Calculate ATS Compatibility Score & Update Bento Gauge
 */
function calculateAtsScore(data) {
  let score = 75; // baseline for single column
  let matchedKeywords = 0;

  // Contact details (+5)
  if (data.personal?.email && data.personal?.phone) {
    score += 5;
  }

  // Experience bullets (+10)
  const hasBullets = (data.experience || []).some(e => (e.bullets && e.bullets.length > 0) || (e.rawDescription && e.rawDescription.length > 30));
  if (hasBullets) {
    score += 10;
  }

  // JD Keyword Matching (+8)
  const jd = (data.jobDescription || "").toLowerCase();
  if (jd.length > 30 && data.skills) {
    data.skills.forEach(skill => {
      if (jd.includes(skill.toLowerCase())) {
        matchedKeywords++;
      }
    });
    if (matchedKeywords >= 3) {
      score += 8;
    }
  }

  score = Math.min(score, 98);

  // Update ATS Gauge in Bento Card
  const scoreValueEl = document.getElementById("atsScoreValue");
  const scoreCircle = document.getElementById("atsScoreCircle");
  const keywordCountEl = document.getElementById("matchedKeywordsCount");

  if (scoreValueEl) {
    scoreValueEl.textContent = `${score}/100`;
  }

  if (scoreCircle) {
    // Circle circumference = 2 * PI * r = 2 * 3.14159 * 42 ≈ 264
    const offset = 264 - (264 * score) / 100;
    scoreCircle.style.strokeDashoffset = offset;
  }

  if (keywordCountEl) {
    keywordCountEl.textContent = `${matchedKeywords} matched`;
  }
}

/**
 * Helper to build clean filename: FirstName_LastName_Resume.ext
 */
function getStandardFileName(extension) {
  const fullName = document.getElementById("fullName")?.value.trim() || "Candidate";
  const sanitized = fullName.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
  return `${sanitized}_Resume.${extension}`;
}

function createPdfExportSheet(source) {
  const sheet = source.cloneNode(true);
  const pixelsPerMillimeter = 96 / 25.4;
  const pageWidth = 210 * pixelsPerMillimeter;
  const pageHeight = 297 * pixelsPerMillimeter;
  const margin = 10 * pixelsPerMillimeter;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;
  const scalableProperties = [
    "fontSize",
    "lineHeight",
    "letterSpacing",
    "marginTop",
    "marginBottom",
    "paddingTop",
    "paddingBottom",
    "borderTopWidth",
    "borderBottomWidth",
    "rowGap"
  ];

  Object.assign(sheet.style, {
    position: "relative",
    width: `${contentWidth}px`,
    maxWidth: "none",
    minHeight: "0",
    height: "auto",
    margin: "0",
    padding: "30px",
    border: "0",
    boxShadow: "none",
    boxSizing: "border-box",
  });

  document.body.appendChild(sheet);

  const elements = [sheet, ...sheet.querySelectorAll("*")];
  const originalStyles = elements.map(element => {
    const computed = window.getComputedStyle(element);
    return scalableProperties.map(property => computed[property]);
  });

  const applyScale = scale => {
    elements.forEach((element, index) => {
      scalableProperties.forEach((property, propertyIndex) => {
        const value = Number.parseFloat(originalStyles[index][propertyIndex]);
        if (Number.isFinite(value)) {
          element.style[property] = `${value * scale}px`;
        }
      });
    });
  };

  let minScale = 0.1;
  let maxScale = 1;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const scale = (minScale + maxScale) / 2;
    applyScale(scale);

    const renderedHeight = sheet.getBoundingClientRect().height;
    if (renderedHeight <= contentHeight) {
      minScale = scale;
    } else {
      maxScale = scale;
    }
  }

  applyScale(minScale);
  return sheet;
}

function printAtsResume() {
  const source = document.getElementById("resume-sheet");
  if (!source) return;

  const printSheet = createPdfExportSheet(source);
  printSheet.id = "print-resume-sheet";
  document.body.classList.add("printing-resume");
  const previewDrawer = document.getElementById("previewDrawer");
  const previousDisplay = previewDrawer?.style.getPropertyValue("display");
  const previousDisplayPriority = previewDrawer?.style.getPropertyPriority("display");
  previewDrawer?.style.setProperty("display", "none", "important");

  const cleanup = () => {
    printSheet.remove();
    document.body.classList.remove("printing-resume");
    if (previewDrawer) {
      if (previousDisplay) {
        previewDrawer.style.setProperty("display", previousDisplay, previousDisplayPriority);
      } else {
        previewDrawer.style.removeProperty("display");
      }
    }
  };

  window.addEventListener("afterprint", cleanup, { once: true });

  try {
    window.print();
  } catch (error) {
    window.removeEventListener("afterprint", cleanup);
    cleanup();
    console.error("Resume printing failed:", error);
    window.showToast("Print preview failed. Please try again.", "error");
  }
}

/**
 * FIX 3: Multi-Format Download Functions
 */

/**
 * 1. PDF Download (Single-page A4 layout)
 */
function downloadAtsPdf() {
  const element = document.getElementById("resume-sheet");
  if (!element) return;

  const filename = getStandardFileName("pdf");
  window.showToast("Preparing single-page A4 PDF...", "info");

  if (!window.html2pdf) {
    printAtsResume();
    return;
  }

  const exportSheet = createPdfExportSheet(element);
  const opt = {
    margin: [10, 10, 10, 10],
    filename: filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };

  window.html2pdf().set(opt).from(exportSheet).save()
    .then(() => {
      window.showToast(`📄 ${filename} downloaded successfully!`, "success");
    })
    .catch((err) => {
      console.error("PDF generation failed:", err);
      window.showToast("PDF download failed. Please try again.", "error");
    })
    .finally(() => exportSheet.remove());
}

/**
 * 2. DOCX Download (Native Microsoft Word Document)
 */
async function downloadDocx() {
  const data = window.getFullFormData();
  const filename = getStandardFileName("docx");
  window.showToast("Generating editable Word (.docx) document...", "info");

  try {
    if (window.docx) {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;

      const docChildren = [];

      // Name Header
      docChildren.push(
        new Paragraph({
          text: (data.personal.name || "Candidate Name").toUpperCase(),
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.LEFT,
          spacing: { after: 120 }
        })
      );

      // Target Role
      if (data.targetRole || data.personal.targetRole) {
        docChildren.push(
          new Paragraph({
            text: data.targetRole || data.personal.targetRole,
            style: "Subtitle",
            spacing: { after: 100 }
          })
        );
      }

      // Contact Line
      const contactInfo = [
        data.personal.email,
        data.personal.phone,
        data.personal.location,
        data.personal.linkedin,
        data.personal.portfolio
      ].filter(Boolean).join(" | ");

      docChildren.push(
        new Paragraph({
          text: contactInfo,
          spacing: { after: 240 }
        })
      );

      // Professional Summary
      if (data.summary) {
        docChildren.push(
          new Paragraph({
            text: "PROFESSIONAL SUMMARY",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 }
          }),
          new Paragraph({
            text: data.summary,
            spacing: { after: 200 }
          })
        );
      }

      // Work Experience
      if (data.experience && data.experience.length > 0) {
        docChildren.push(
          new Paragraph({
            text: "WORK EXPERIENCE",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 }
          })
        );

        data.experience.forEach(exp => {
          docChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: exp.title || "Job Title", bold: true }),
                new TextRun({ text: ` — ${exp.company || "Company"}` }),
                new TextRun({ text: `   (${exp.duration || ""})`, italics: true })
              ],
              spacing: { before: 100, after: 50 }
            })
          );

          const bullets = exp.bullets || (exp.rawDescription ? exp.rawDescription.split("\n").filter(Boolean) : []);
          bullets.forEach(b => {
            docChildren.push(
              new Paragraph({
                text: b.replace(/^[-*•]\s*/, ""),
                bullet: { level: 0 },
                spacing: { after: 40 }
              })
            );
          });
        });
      }

      // Education
      if (data.education && data.education.length > 0) {
        docChildren.push(
          new Paragraph({
            text: "EDUCATION",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 }
          })
        );

        data.education.forEach(edu => {
          docChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: edu.degree || "Degree", bold: true }),
                new TextRun({ text: ` — ${edu.college || "University"}` }),
                new TextRun({ text: ` (${edu.year || ""})`, italics: true })
              ],
              spacing: { after: 50 }
            })
          );
        });
      }

      // Skills
      if (data.skills && data.skills.length > 0) {
        docChildren.push(
          new Paragraph({
            text: "TECHNICAL SKILLS",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 }
          }),
          new Paragraph({
            text: data.skills.join(", "),
            spacing: { after: 200 }
          })
        );
      }

      const doc = new Document({
        sections: [{ properties: {}, children: docChildren }]
      });

      const blob = await Packer.toBlob(doc);
      if (window.saveAs) {
        window.saveAs(blob, filename);
      } else {
        downloadBlob(blob, filename);
      }
      window.showToast(`📝 ${filename} created successfully!`, "success");
      return;
    }
  } catch (err) {
    console.warn("docx library export error, falling back to clean text docx:", err);
  }

  // Native XML Fallback if docx fails
  const txtContent = generatePlainTextString(data);
  const blob = new Blob([txtContent], { type: "application/msword;charset=utf-8" });
  downloadBlob(blob, filename);
  window.showToast(`📝 ${filename} downloaded!`, "success");
}

/**
 * 3. TXT Download
 */
function downloadTxt() {
  const data = window.getFullFormData();
  const filename = getStandardFileName("txt");
  const content = generatePlainTextString(data);

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, filename);
  window.showToast(`📋 ${filename} downloaded successfully!`, "success");
}

/**
 * 4. Copy Plain Text
 */
function copyAtsPlainText() {
  const data = window.getFullFormData();
  const text = generatePlainTextString(data);

  navigator.clipboard.writeText(text).then(() => {
    window.showToast("🔗 Plain text copied to clipboard!", "success");
  }).catch(() => {
    window.showToast("Clipboard access failed.", "error");
  });
}

function generatePlainTextString(data) {
  const lines = [];

  // Name & Title
  lines.push((data.personal.name || "CANDIDATE").toUpperCase());
  if (data.targetRole || data.personal.targetRole) {
    lines.push(data.targetRole || data.personal.targetRole);
  }

  // Contact
  const contact = [
    data.personal.email,
    data.personal.phone,
    data.personal.location,
    data.personal.linkedin,
    data.personal.portfolio
  ].filter(Boolean).join(" | ");
  lines.push(contact);
  lines.push("");

  // Summary
  if (data.summary) {
    lines.push("PROFESSIONAL SUMMARY");
    lines.push("--------------------");
    lines.push(data.summary);
    lines.push("");
  }

  // Experience
  if (data.experience && data.experience.length > 0) {
    lines.push("WORK EXPERIENCE");
    lines.push("---------------");
    data.experience.forEach(exp => {
      lines.push(`${exp.title || "Job Title"} | ${exp.company || "Company"} | ${exp.duration || ""} | ${exp.location || ""}`);
      const bullets = exp.bullets || (exp.rawDescription ? exp.rawDescription.split("\n").filter(Boolean) : []);
      bullets.forEach(b => lines.push(`• ${b.replace(/^[-*•]\s*/, "")}`));
      lines.push("");
    });
  }

  // Projects
  if (data.projects && data.projects.length > 0) {
    lines.push("KEY PROJECTS");
    lines.push("------------");
    data.projects.forEach(p => {
      lines.push(`${p.name} | ${p.tech || ""} | ${p.link || ""}`);
      if (p.desc) lines.push(`• ${p.desc}`);
      lines.push("");
    });
  }

  // Education
  if (data.education && data.education.length > 0) {
    lines.push("EDUCATION");
    lines.push("---------");
    data.education.forEach(edu => {
      lines.push(`${edu.degree} | ${edu.college} | ${edu.year || ""} | ${edu.cgpa || ""}`);
    });
    lines.push("");
  }

  // Skills
  if (data.skills && data.skills.length > 0) {
    lines.push("TECHNICAL SKILLS");
    lines.push("----------------");
    lines.push(data.skills.join(", "));
  }

  return lines.join("\n");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// Global Exports
window.renderResume = renderResume;
window.setResumeFont = setResumeFont;
window.setResumeDensity = setResumeDensity;
window.downloadAtsPdf = downloadAtsPdf;
window.downloadDocx = downloadDocx;
window.downloadTxt = downloadTxt;
window.copyAtsPlainText = copyAtsPlainText;
window.calculateAtsScore = calculateAtsScore;
window.printAtsResume = printAtsResume;
