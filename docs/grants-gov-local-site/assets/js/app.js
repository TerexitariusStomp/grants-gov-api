document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const keyword = document.getElementById('keyword').value.trim() || 'all';
  const agency = document.getElementById('agency').value.trim() || 'all agencies';
  alert(`Demo search submitted for "${keyword}" in ${agency}.\nConnect a backend/API for real results.`);
});
