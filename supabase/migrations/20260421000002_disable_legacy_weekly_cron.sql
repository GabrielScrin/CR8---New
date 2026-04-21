do $$
declare
  v_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid into v_job_id
    from cron.job
    where jobname = 'cr8_weekly_reports'
    limit 1;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
  end if;
exception
  when insufficient_privilege then
    raise notice 'Sem permissao para desativar o cron legado.';
end
$$;
