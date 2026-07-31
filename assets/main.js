// ============================================================
// Kare By Kari — shared behavior
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initFooterYear();
  initCalendar();
  initBookingForm();
  initAdminCalendar();
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

/* ---------------- Shared date helpers ---------------- */
function toLocalISO(date){
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, count){
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

function displayDate(value){
  return new Intl.DateTimeFormat('en-US', {
    month:'short',
    day:'numeric',
    year:'numeric',
    timeZone:'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

async function readJSON(response){
  const data = await response.json().catch(() => ({}));
  if(!response.ok){
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

/* ---------------- Live availability calendar ---------------- */
function initCalendar(){
  const shell = document.querySelector('[data-calendar]');
  if(!shell) return;

  const monthLabel = shell.querySelector('[data-cal-month]');
  const grid = shell.querySelector('[data-cal-grid]');
  const prevBtn = shell.querySelector('[data-cal-prev]');
  const nextBtn = shell.querySelector('[data-cal-next]');
  const message = document.querySelector('[data-calendar-message]');

  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let unavailableDates = new Set();
  let requestNumber = 0;

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
      const dateValue = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cell = document.createElement('a');
      const cellDate = new Date(viewYear, viewMonth, d);
      const isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const isToday = cellDate.toDateString() === today.toDateString();
      const isBooked = unavailableDates.has(dateValue);

      cell.className = 'cal-day' + (isBooked ? ' booked' : (isPast ? '' : ' available')) + (isToday ? ' today' : '');
      cell.textContent = d;
      if(isBooked){
        cell.title = 'Unavailable';
        cell.setAttribute('aria-label', `${displayDate(dateValue)} is unavailable`);
      } else if(!isPast){
        cell.title = 'Available — select this date';
        cell.href = `book.html?start=${dateValue}`;
        cell.setAttribute('aria-label', `${displayDate(dateValue)} is available`);
      } else {
        cell.setAttribute('aria-disabled', 'true');
      }
      grid.appendChild(cell);
    }
  }

  async function loadMonth(){
    const currentRequest = ++requestNumber;
    const start = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const end = toLocalISO(new Date(viewYear, viewMonth + 1, 0));
    if(message) message.textContent = 'Checking live availability…';
    unavailableDates = new Set();
    render();

    try{
      const data = await fetch(`/api/availability?start=${start}&end=${end}`, {
        headers:{ Accept:'application/json' },
      }).then(readJSON);
      if(currentRequest !== requestNumber) return;
      unavailableDates = new Set(data.unavailable || []);
      if(message) message.textContent = 'Availability is live. Select any open day to start a booking.';
    } catch(error){
      if(currentRequest !== requestNumber) return;
      if(message) message.textContent = error.message;
    }
    render();
  }

  prevBtn.addEventListener('click', async () => {
    viewMonth--; if(viewMonth < 0){ viewMonth = 11; viewYear--; }
    await loadMonth();
  });
  nextBtn.addEventListener('click', async () => {
    viewMonth++; if(viewMonth > 11){ viewMonth = 0; viewYear++; }
    await loadMonth();
  });

  loadMonth();
}

/* ---------------- Atomic date-range booking ---------------- */
function initBookingForm(){
  const form = document.querySelector('[data-booking-form]');
  if(!form) return;

  const success = document.querySelector('[data-booking-success]');
  const errorBox = document.querySelector('[data-booking-error]');
  const submit = document.querySelector('[data-booking-submit]');
  const startInput = form.querySelector('#startDate');
  const endInput = form.querySelector('#endDate');
  const today = toLocalISO(new Date());

  startInput.min = today;
  endInput.min = today;

  const queryStart = new URLSearchParams(window.location.search).get('start');
  if(queryStart && /^\d{4}-\d{2}-\d{2}$/.test(queryStart) && queryStart >= today){
    startInput.value = queryStart;
    endInput.value = queryStart;
  }

  startInput.addEventListener('change', () => {
    endInput.min = startInput.value || today;
    if(!endInput.value || endInput.value < startInput.value){
      endInput.value = startInput.value;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    errorBox.classList.remove('show');
    success?.classList.remove('show');

    if(data.endDate < data.startDate){
      errorBox.textContent = 'The end date must be on or after the start date.';
      errorBox.classList.add('show');
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Checking Dates…';

    try{
      const result = await fetch('/api/book', {
        method:'POST',
        headers:{
          Accept:'application/json',
          'Content-Type':'application/json',
        },
        body:JSON.stringify(data),
      }).then(readJSON);

      if(success){
        success.textContent = `${result.message} Booking number: ${result.bookingId.slice(0, 8).toUpperCase()}.`;
        success.classList.add('show');
        success.setAttribute('tabindex', '-1');
        success.focus();
      }
      form.reset();
      startInput.min = today;
      endInput.min = today;
    } catch(error){
      errorBox.textContent = error.message;
      errorBox.classList.add('show');
      errorBox.setAttribute('tabindex', '-1');
      errorBox.focus();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Book These Dates';
    }
  });
}

/* ---------------- Private owner calendar ---------------- */
function initAdminCalendar(){
  const keyInput = document.querySelector('[data-admin-key]');
  if(!keyInput) return;

  const startInput = document.querySelector('[data-admin-start]');
  const endInput = document.querySelector('[data-admin-end]');
  const message = document.querySelector('[data-admin-message]');
  const schedule = document.querySelector('[data-admin-schedule]');
  const blockButton = document.querySelector('[data-admin-block]');
  const unblockButton = document.querySelector('[data-admin-unblock]');
  const refreshButton = document.querySelector('[data-admin-refresh]');

  const today = new Date();
  startInput.value = toLocalISO(today);
  endInput.value = toLocalISO(today);
  keyInput.value = sessionStorage.getItem('kbk-owner-key') || '';

  startInput.addEventListener('change', () => {
    endInput.min = startInput.value;
    if(endInput.value < startInput.value) endInput.value = startInput.value;
  });

  function showMessage(text, isError = false){
    message.textContent = text;
    message.classList.toggle('error', isError);
    message.classList.add('show');
  }

  async function adminRequest(body){
    const key = keyInput.value.trim();
    if(!key) throw new Error('Enter the owner password first.');
    sessionStorage.setItem('kbk-owner-key', key);
    return fetch('/api/admin', {
      method:'POST',
      headers:{
        Accept:'application/json',
        'Content-Type':'application/json',
        'X-Admin-Key':key,
      },
      body:JSON.stringify(body),
    }).then(readJSON);
  }

  function renderSchedule(data){
    schedule.innerHTML = '';

    const blocked = (data.dates || []).filter(item => item.type === 'blocked');
    if(blocked.length){
      const blockedSection = document.createElement('section');
      const title = document.createElement('h3');
      title.textContent = 'Dates you blocked';
      blockedSection.appendChild(title);
      const chips = document.createElement('div');
      chips.className = 'blocked-date-list';
      blocked.forEach(item => {
        const chip = document.createElement('span');
        chip.textContent = displayDate(item.date);
        chips.appendChild(chip);
      });
      blockedSection.appendChild(chips);
      schedule.appendChild(blockedSection);
    }

    const bookingsTitle = document.createElement('h3');
    bookingsTitle.textContent = 'Customer bookings';
    schedule.appendChild(bookingsTitle);

    if(!data.bookings?.length){
      const empty = document.createElement('p');
      empty.textContent = 'No customer bookings in the next six months.';
      schedule.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'owner-bookings';
    data.bookings.forEach(booking => {
      const card = document.createElement('article');
      card.className = 'owner-booking';

      const heading = document.createElement('h4');
      heading.textContent = `${booking.dogName} — ${booking.service}`;
      card.appendChild(heading);

      const dates = document.createElement('p');
      dates.className = 'owner-booking-dates';
      dates.textContent = booking.startDate === booking.endDate
        ? displayDate(booking.startDate)
        : `${displayDate(booking.startDate)} – ${displayDate(booking.endDate)}`;
      card.appendChild(dates);

      const contact = document.createElement('p');
      contact.textContent = `${booking.ownerName} • ${booking.phone || 'No phone'} • ${booking.email}`;
      card.appendChild(contact);

      if(booking.dogBreed){
        const breed = document.createElement('p');
        breed.textContent = booking.dogBreed;
        card.appendChild(breed);
      }
      if(booking.notes){
        const notes = document.createElement('p');
        notes.textContent = booking.notes;
        card.appendChild(notes);
      }

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'text-button danger';
      cancel.textContent = 'Cancel booking and reopen dates';
      cancel.addEventListener('click', async () => {
        if(!window.confirm(`Cancel ${booking.dogName}'s booking and reopen all of its dates?`)) return;
        try{
          const result = await adminRequest({ action:'cancel', bookingId:booking.id });
          showMessage(result.message);
          await loadSchedule();
        } catch(error){
          showMessage(error.message, true);
        }
      });
      card.appendChild(cancel);
      list.appendChild(card);
    });
    schedule.appendChild(list);
  }

  async function loadSchedule(){
    try{
      refreshButton.disabled = true;
      const data = await adminRequest({
        action:'list',
        startDate:toLocalISO(today),
        endDate:toLocalISO(addDays(today, 180)),
      });
      renderSchedule(data);
      showMessage('Calendar refreshed.');
    } catch(error){
      showMessage(error.message, true);
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function updateBlockedDates(action){
    try{
      blockButton.disabled = true;
      unblockButton.disabled = true;
      const result = await adminRequest({
        action,
        startDate:startInput.value,
        endDate:endInput.value || startInput.value,
      });
      showMessage(result.message);
      await loadSchedule();
    } catch(error){
      showMessage(error.message, true);
    } finally {
      blockButton.disabled = false;
      unblockButton.disabled = false;
    }
  }

  blockButton.addEventListener('click', () => updateBlockedDates('block'));
  unblockButton.addEventListener('click', () => updateBlockedDates('unblock'));
  refreshButton.addEventListener('click', loadSchedule);

  if(keyInput.value) loadSchedule();
}
