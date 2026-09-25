// Explicit operations only: the website cannot proxy arbitrary service routes.
export function workspaceRoute(operation,id) {
  const routes={state:['GET','/api/state'],settings:['PATCH','/api/settings'],integrations:['POST','/api/integrations'],
    create:['POST','/api/posts'],edit:['PATCH','/api/posts/:id'],link:['GET','/api/posts/:id/link'],
    unschedule:['POST','/api/posts/:id/unschedule'],resolve:['POST','/api/posts/:id/resolve'],
    generate:['POST','/api/generate'],refresh:['POST','/api/research/refresh'],
    'add-feed':['POST','/api/feeds'],'remove-feed':['DELETE','/api/feeds/:id'],
    'add-source':['POST','/api/sources'],'verify-source':['PATCH','/api/sources/:id'],
    upload:['POST','/api/media'],metrics:['POST','/api/metrics/sync'],disconnect:['POST','/api/x/disconnect']};
  const route=routes[operation];if(!route) throw new Error('Unknown workspace operation.');
  if(route[1].includes(':id')&&!/^[a-f0-9-]{36}$/.test(id||'')) throw new Error('Invalid item ID.');
  return {method:route[0],path:route[1].replace(':id',id)};
}
