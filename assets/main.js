// ============================================================
// Kare By Kari — shared behavior
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initFooterYear();
  initCalendar();
  initBookingForm();
});

/* ---------------- Mobile nav ---------------- */
function initNav(){
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if(!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => links.classList.remove('open'));
  });
}

/* ---------------- Footer year ---------------- */
function initFooterYear(){
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });
}

/* ---------------- Availability calendar ----------------
   Demo data only — swap BOOKED_DATES for real booked dates,
   or wire this up to a real booking system later.
------------------------------------------------------------- */
function initCalendar(){
  const shell = document.querySelector('[data-calendar]');
  if(!shell) return;

  const monthLabel = shell.querySelector('[data-cal-month]');
  const grid = shell.querySelector('[data-cal-grid]');
  const prevBtn = shell.querySelector('[data-cal-prev]');
  const nextBtn = shell.querySelector('[data-cal-next]');

  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();

  // Example already-booked dates, formatted "YYYY-M-D" (month is 0-indexed).
  // Replace with your real calendar data.
  const BOOKED_DATES = new Set([
    `${today.getFullYear()}-${today.getMonth()}-${Math.min(today.getDate()+3, 27)}`,
    `${today.getFullYear()}-${today.getMonth()}-${Math.min(today.getDate()+4, 28)}`,
    `${today.getFullYear()}-${today.getMonth()}-${Math.min(today.getDate()+11, 24)}`,
    `${today.getFullYear()}-${today.getMonth()}-${Math.min(today.getDate()+12, 25)}`,
    `${today.getFullYear()}-${today.getMonth()}-${Math.min(today.getDate()+18, 22)}`,
  ]);

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dowNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function render(){
    monthLabel.textContent = `${monthNames[viewMonth]} ${viewYear}`;
    grid.innerHTML = '';

    dowNames.forEach(d => {
      const el = document.createElement('div');
      el.className = 'dow';
      el.textContent = d;
      grid.appendChild(el);
    });

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for(let i=0; i<firstDay; i++){
      const pad = document.createElement('div');
      pad.className = 'cal-day pad';
      grid.appendChild(pad);
    }

    for(let d=1; d<=daysInMonth; d++){
      const cell = document.createElement('div');
      const key = `${viewYear}-${viewMonth}-${d}`;
      const cellDate = new Date(viewYear, viewMonth, d);
      const isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const isToday = cellDate.toDateString() === today.toDateString();
      const isBooked = BOOKED_DATES.has(key);

      cell.className = 'cal-day' + (isBooked ? ' booked' : (isPast ? '' : ' available')) + (isToday ? ' today' : '');
      cell.textContent = d;
      if(isBooked) cell.title = 'Booked';
      else if(!isPast) cell.title = 'Available';
      grid.appendChild(cell);
    }
  }

  prevBtn.addEventListener('click', () => {
    viewMonth--; if(viewMonth < 0){ viewMonth = 11; viewYear--; }
    render();
  });
  nextBtn.addEventListener('click', () => {
    viewMonth++; if(viewMonth > 11){ viewMonth = 0; viewYear++; }
    render();
  });

  render();
}

/* ---------------- Booking form ----------------
   No backend is wired up yet. On submit this builds a mailto:
   link pre-filled with the request so it lands in your inbox,
   and shows an on-page confirmation. Swap in a real endpoint
   (email service, booking API, etc.) when you're ready.
------------------------------------------------------------- */
function initBookingForm(){
  const form = document.querySelector('[data-booking-form]');
  if(!form) return;

  const success = document.querySelector('[data-booking-success]');
  const OWNER_EMAIL = 'karebykari@gmail.com';

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    const subject = encodeURIComponent(`Booking request — ${data.dogName || 'a pup'}`);
    const bodyLines = [
      `Owner: ${data.ownerName || ''}`,
      `Email: ${data.email || ''}`,
      `Phone: ${data.phone || ''}`,
      `Dog: ${data.dogName || ''} (${data.dogBreed || ''})`,
      `Service: ${data.service || ''}`,
      `Dates: ${data.startDate || ''} to ${data.endDate || ''}`,
      `Notes: ${data.notes || ''}`,
    ];
    const body = encodeURIComponent(bodyLines.join('\n'));
    const mailtoLink = `mailto:${OWNER_EMAIL}?subject=${subject}&body=${body}`;

    window.location.href = mailtoLink;

    if(success){
      success.classList.add('show');
      success.setAttribute('tabindex', '-1');
      success.focus();
    }
    form.reset();
  });
}
