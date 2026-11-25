export default function AdminLoading() {
  return (
    <div className="adminLoading" role="status" aria-label="Loading admin workspace">
      <span className="adminSkeleton adminSkeletonTitle" />
      <div className="adminSkeletonGrid">
        {Array.from({ length: 4 }, (_, index) => <span className="adminSkeleton adminSkeletonStat" key={index} />)}
      </div>
      <span className="adminSkeleton adminSkeletonPanel" />
    </div>
  );
}
